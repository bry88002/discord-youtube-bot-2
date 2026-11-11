import { accrueActivity, ActivityUsage, createActivityUsage, dueActivityAlert, localDayKey, updateActivity } from 'bot-functions';
import { config, globals } from 'bot-config';
import { Client, GuildMember, PartialGuildMember, Presence, VoiceState } from 'discord.js';

const activityNamespace = `${config.redisNamespace}:activityLimits`;
const memberRegistryKey = (guildId: string) => `${activityNamespace}:${guildId}:members`;
const usageKey = (guildId: string, userId: string) => `${activityNamespace}:${guildId}:${userId}`;

class ActivityLimitManager {
	private client?: Client;
	private timer?: NodeJS.Timeout;
	private sweepRunning = false;
	private readonly pending = new Map<string, Promise<void>>();

	private readonly handleVoiceStateUpdate = (oldState: VoiceState, newState: VoiceState) => {
		const userId = newState.id;
		const guildId = newState.guild.id;
		const voiceActive = !!newState.channelId;

		this.updateVoiceActivity(guildId, userId, voiceActive).catch(console.error);
	};

	private readonly handlePresenceUpdate = (_oldPresence: Presence | null, newPresence: Presence) => {
		if (!newPresence.guild) return;

		const userId = newPresence.userId;
		const gameActive = newPresence.activities.some(activity => activity.type === 'PLAYING');

		this.updateGameActivity(newPresence.guild.id, userId, gameActive).catch(console.error);
	};

	private readonly handleGuildMemberRemove = (member: GuildMember | PartialGuildMember) => {
		this.updateMember(member.guild.id, member.id, false, false).catch(console.error);
	};

	async start(client: Client) {
		if (this.client) return;

		this.client = client;
		client.on('voiceStateUpdate', this.handleVoiceStateUpdate);
		client.on('presenceUpdate', this.handlePresenceUpdate);
		client.on('guildMemberRemove', this.handleGuildMemberRemove);

		await this.restoreTrackedMembers();
		this.timer = setInterval(() => {
			this.sweep().catch(console.error);
		}, 30_000);
		this.timer.unref();
	}

	async enroll(guildId: string, userId: string, limitMinutes: number, voiceActive: boolean, gameActive: boolean) {
		const key = usageKey(guildId, userId);

		return this.serialize(key, async () => {
			if (await globals.redisClient.exists(key)) return false;

			const now = new Date();
			const usage = createActivityUsage(limitMinutes, voiceActive, gameActive, now);
			await globals.redisClient.set(key, JSON.stringify(usage));
			await globals.redisClient.sAdd(memberRegistryKey(guildId), userId);
			await this.persistAndNotify(guildId, userId, usage);
			return true;
		});
	}

	async setLimit(guildId: string, userId: string, limitMinutes: number) {
		return this.mutate(guildId, userId, usage => {
			accrueActivity(usage, new Date());
			usage.limitMinutes = limitMinutes;
			usage.warningSent = false;
			usage.limitSent = false;
		});
	}

	async unenroll(guildId: string, userId: string) {
		const key = usageKey(guildId, userId);

		return this.serialize(key, async () => {
			const exists = await globals.redisClient.exists(key);
			if (!exists) return false;

			await globals.redisClient.del(key);
			await globals.redisClient.sRem(memberRegistryKey(guildId), userId);
			return true;
		});
	}

	private async updateVoiceActivity(guildId: string, userId: string, voiceActive: boolean) {
		await this.mutate(guildId, userId, usage => {
			updateActivity(usage, voiceActive, usage.gameActive, new Date());
		});
	}

	private async updateGameActivity(guildId: string, userId: string, gameActive: boolean) {
		await this.mutate(guildId, userId, usage => {
			updateActivity(usage, usage.voiceActive, gameActive, new Date());
		});
	}

	private async updateMember(guildId: string, userId: string, voiceActive: boolean, gameActive: boolean) {
		await this.mutate(guildId, userId, usage => {
			updateActivity(usage, voiceActive, gameActive, new Date());
		});
	}

	private async mutate(guildId: string, userId: string, update: (usage: ActivityUsage) => void) {
		const key = usageKey(guildId, userId);

		return this.serialize(key, async () => {
			const usage = await this.readUsage(key);
			if (!usage) return false;

			update(usage);
			await this.persistAndNotify(guildId, userId, usage);
			return true;
		});
	}

	private async restoreTrackedMembers() {
		if (!this.client) return;

		for (const guild of this.client.guilds.cache.values()) {
			const userIds = await globals.redisClient.sMembers(memberRegistryKey(guild.id));

			for (const userId of userIds) {
				try {
					const member = await guild.members.fetch(userId);
					const gameActive = this.isPlayingGame(member);
					const voiceActive = !!member.voice.channelId;
					await this.restoreMember(guild.id, userId, voiceActive, gameActive);
				} catch (error) {
					console.error(`Unable to restore activity tracking for member ${userId} in guild ${guild.id}.`, error);
					await this.restoreMember(guild.id, userId, false, false);
				}
			}
		}
	}

	private async restoreMember(guildId: string, userId: string, voiceActive: boolean, gameActive: boolean) {
		const key = usageKey(guildId, userId);

		await this.serialize(key, async () => {
			const usage = await this.readUsage(key);
			if (!usage) return;

			const now = new Date();
			if (usage.dayKey !== localDayKey(now)) {
				usage.dayKey = localDayKey(now);
				usage.totalMs = 0;
				usage.warningSent = false;
				usage.limitSent = false;
			}
			usage.voiceActive = voiceActive;
			usage.gameActive = gameActive;
			usage.activeSince = voiceActive || gameActive ? now.getTime() : null;
			await this.persistAndNotify(guildId, userId, usage);
		});
	}

	private async sweep() {
		if (this.sweepRunning || !this.client) return;

		this.sweepRunning = true;

		try {
			for (const guild of this.client.guilds.cache.values()) {
				const userIds = await globals.redisClient.sMembers(memberRegistryKey(guild.id));

				for (const userId of userIds) {
					try {
						await this.mutate(guild.id, userId, usage => {
							accrueActivity(usage, new Date());
						});
					} catch (error) {
						console.error(`Unable to update activity tracking for member ${userId} in guild ${guild.id}.`, error);
					}
				}
			}
		} finally {
			this.sweepRunning = false;
		}
	}

	private async persistAndNotify(guildId: string, userId: string, usage: ActivityUsage) {
		const alert = dueActivityAlert(usage);

		if (alert === 'warning') usage.warningSent = true;
		if (alert === 'limit') usage.limitSent = true;

		await globals.redisClient.set(usageKey(guildId, userId), JSON.stringify(usage));

		if (!alert || !this.client) return;

		const limitMs = usage.limitMinutes * 60_000;
		const limit = this.formatDuration(limitMs);
		const remainingMinutes = Math.max(1, Math.ceil((limitMs - usage.totalMs) / 60_000));
		const message =
			alert === 'warning'
				? `You have about ${Math.min(15, remainingMinutes)} minutes remaining in your daily activity limit of ${limit}.`
				: `You have reached your daily activity limit of ${limit}.`;

		try {
			const user = await this.client.users.fetch(userId);
			await user.send(message);
		} catch (error) {
			console.error(`Could not DM activity-limit alert to member ${userId} in guild ${guildId}.`, error);
		}
	}

	private async readUsage(key: string): Promise<ActivityUsage | null> {
		const serialized = await globals.redisClient.get(key);
		return serialized ? (JSON.parse(serialized) as ActivityUsage) : null;
	}

	private isPlayingGame(member: GuildMember | null | undefined) {
		return !!member?.presence?.activities.some(activity => activity.type === 'PLAYING');
	}

	private formatDuration(milliseconds: number) {
		const totalMinutes = Math.ceil(milliseconds / 60_000);
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;

		if (hours && minutes) return `${hours}h ${minutes}m`;
		if (hours) return `${hours}h`;
		return `${minutes}m`;
	}

	private async serialize<TResponse>(key: string, task: () => Promise<TResponse>): Promise<TResponse> {
		const previous = this.pending.get(key) || Promise.resolve();
		const current = previous.then(task, task);
		const tail = current.then(
			() => undefined,
			() => undefined
		);
		this.pending.set(key, tail);

		try {
			return await current;
		} finally {
			if (this.pending.get(key) === tail) this.pending.delete(key);
		}
	}
}

export const activityLimitManager = new ActivityLimitManager();
