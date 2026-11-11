import { SlashCommandBuilder } from '@discordjs/builders';
import { activityLimitManager, CmdRequirementError, CommandInteractionHelper } from 'bot-classes';
import { ResponseEmojis } from 'bot-config';
import { BaseCommand } from '../BaseCommand';
import { command } from '../decorators/command';

export default class Limits implements BaseCommand {
	register() {
		return new SlashCommandBuilder()
			.setName('limits')
			.setDescription("Manage members' daily game and voice activity limits.")
			.addSubcommand(subcommand =>
				subcommand
					.setName('enroll')
					.setDescription('Enroll a member and set their daily activity limit.')
					.addUserOption(option => option.setName('member').setDescription('Member to enroll.').setRequired(true))
					.addIntegerOption(option => option.setName('limit_minutes').setDescription('Daily combined limit in minutes.').setRequired(true))
			)
			.addSubcommand(subcommand =>
				subcommand
					.setName('set')
					.setDescription("Change an enrolled member's daily activity limit.")
					.addUserOption(option => option.setName('member').setDescription('Enrolled member.').setRequired(true))
					.addIntegerOption(option => option.setName('limit_minutes').setDescription('Daily combined limit in minutes.').setRequired(true))
			)
			.addSubcommand(subcommand =>
				subcommand
					.setName('unenroll')
					.setDescription('Stop tracking a member and remove their activity data.')
					.addUserOption(option => option.setName('member').setDescription('Member to unenroll.').setRequired(true))
			);
	}

	@command({ requires: ['ADMINISTRATOR'] })
	runner() {
		return;
	}

	async enroll(handler: CommandInteractionHelper) {
		const interaction = handler.commandInteraction;
		const user = interaction.options.getUser('member', true);
		const limitMinutes = this.getLimitMinutes(handler);
		if (user.bot) throw new CmdRequirementError('Bot accounts cannot be enrolled.');

		const member = await handler.guild.members.fetch(user.id);
		const enrolled = await activityLimitManager.enroll(
			handler.guild.id,
			user.id,
			limitMinutes,
			!!member.voice.channelId,
			!!member.presence?.activities.some(activity => activity.type === 'PLAYING')
		);

		if (!enrolled) throw new CmdRequirementError('That member is already enrolled. Use `/limits set` to change their limit.');

		let dmNotice = '';
		try {
			await user.send(
				`You have been enrolled in daily activity tracking for ${handler.guild.name}. Game activity and time in voice channels count toward a combined ${this.formatDuration(
					limitMinutes
				)} daily limit. Overlapping time counts once.`
			);
		} catch (error) {
			console.error(`Could not send activity tracking notice to member ${user.id}.`, error);
			dmNotice = ' I could not DM them the enrollment notice, so please let them know directly.';
		}

		await handler.respondWithEmoji(`Enrolled ${user.tag} with a ${this.formatDuration(limitMinutes)} daily limit.${dmNotice}`, ResponseEmojis.Success);
	}

	async set(handler: CommandInteractionHelper) {
		const user = handler.commandInteraction.options.getUser('member', true);
		const limitMinutes = this.getLimitMinutes(handler);
		const updated = await activityLimitManager.setLimit(handler.guild.id, user.id, limitMinutes);

		if (!updated) throw new CmdRequirementError('That member is not enrolled. Use `/limits enroll` first.');

		await handler.respondWithEmoji(`Set ${user.tag}'s daily activity limit to ${this.formatDuration(limitMinutes)}.`, ResponseEmojis.Success);
	}

	async unenroll(handler: CommandInteractionHelper) {
		const user = handler.commandInteraction.options.getUser('member', true);
		const removed = await activityLimitManager.unenroll(handler.guild.id, user.id);

		if (!removed) throw new CmdRequirementError('That member is not enrolled.');

		await handler.respondWithEmoji(`Unenrolled ${user.tag} and removed their activity tracking data.`, ResponseEmojis.Success);
	}

	private getLimitMinutes(handler: CommandInteractionHelper) {
		const limitMinutes = handler.commandInteraction.options.getInteger('limit_minutes', true);

		if (limitMinutes < 1 || limitMinutes > 1440) {
			throw new CmdRequirementError('Daily limit must be between 1 and 1440 minutes.');
		}

		return limitMinutes;
	}

	private formatDuration(minutes: number) {
		const hours = Math.floor(minutes / 60);
		const remainingMinutes = minutes % 60;

		if (hours && remainingMinutes) return `${hours}h ${remainingMinutes}m`;
		if (hours) return `${hours}h`;
		return `${remainingMinutes}m`;
	}
}
