export interface ActivityUsage {
	dayKey: string;
	limitMinutes: number;
	totalMs: number;
	activeSince: number | null;
	voiceActive: boolean;
	gameActive: boolean;
	warningSent: boolean;
	limitSent: boolean;
}

export type ActivityAlert = 'warning' | 'limit';

export function localDayKey(date: Date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function localDayStart(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function createActivityUsage(limitMinutes: number, voiceActive: boolean, gameActive: boolean, now: Date): ActivityUsage {
	const active = voiceActive || gameActive;

	return {
		dayKey: localDayKey(now),
		limitMinutes,
		totalMs: 0,
		activeSince: active ? now.getTime() : null,
		voiceActive,
		gameActive,
		warningSent: false,
		limitSent: false
	};
}

export function accrueActivity(usage: ActivityUsage, now: Date) {
	const currentDay = localDayKey(now);

	if (usage.dayKey !== currentDay) {
		usage.dayKey = currentDay;
		usage.totalMs = 0;
		usage.warningSent = false;
		usage.limitSent = false;
		usage.activeSince = usage.voiceActive || usage.gameActive ? localDayStart(now) : null;
	}

	if ((usage.voiceActive || usage.gameActive) && usage.activeSince !== null) {
		usage.totalMs += Math.max(0, now.getTime() - usage.activeSince);
		usage.activeSince = now.getTime();
	}
}

export function updateActivity(usage: ActivityUsage, voiceActive: boolean, gameActive: boolean, now: Date) {
	accrueActivity(usage, now);
	const wasActive = usage.voiceActive || usage.gameActive;
	usage.voiceActive = voiceActive;
	usage.gameActive = gameActive;
	const isActive = voiceActive || gameActive;

	if (!wasActive && isActive) usage.activeSince = now.getTime();
	else if (wasActive && !isActive) usage.activeSince = null;
}

export function dueActivityAlert(usage: ActivityUsage): ActivityAlert | null {
	if (usage.limitSent) return null;

	const limitMs = usage.limitMinutes * 60_000;

	if (usage.totalMs >= limitMs) return 'limit';
	if (usage.totalMs > 0 && !usage.warningSent && limitMs - usage.totalMs <= 15 * 60_000) return 'warning';

	return null;
}
