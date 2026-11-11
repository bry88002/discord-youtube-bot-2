import { createActivityUsage, dueActivityAlert, updateActivity, accrueActivity } from './activityUsage';

describe('activity usage', () => {
	it('counts overlapping voice and game activity once', () => {
		const start = new Date(2026, 10, 11, 10, 0, 0);
		const usage = createActivityUsage(120, true, false, start);

		updateActivity(usage, true, true, new Date(start.getTime() + 30 * 60_000));
		updateActivity(usage, false, true, new Date(start.getTime() + 60 * 60_000));
		updateActivity(usage, false, false, new Date(start.getTime() + 90 * 60_000));

		expect(usage.totalMs).toBe(90 * 60_000);
		expect(usage.activeSince).toBeNull();
	});

	it('starts a new local-day total at midnight while activity continues', () => {
		const beforeMidnight = new Date(2026, 10, 11, 23, 30, 0);
		const usage = createActivityUsage(120, true, false, beforeMidnight);

		accrueActivity(usage, new Date(2026, 10, 12, 0, 30, 0));

		expect(usage.totalMs).toBe(30 * 60_000);
		expect(usage.dayKey).toBe('2026-11-12');
		expect(usage.activeSince).toBe(new Date(2026, 10, 12, 0, 30, 0).getTime());
	});

	it('sends one warning near the limit and a separate limit alert at expiry', () => {
		const start = new Date(2026, 10, 11, 10, 0, 0);
		const usage = createActivityUsage(60, true, false, start);

		accrueActivity(usage, new Date(start.getTime() + 45 * 60_000));
		expect(dueActivityAlert(usage)).toBe('warning');

		usage.warningSent = true;
		accrueActivity(usage, new Date(start.getTime() + 60 * 60_000));
		expect(dueActivityAlert(usage)).toBe('limit');

		usage.limitSent = true;
		expect(dueActivityAlert(usage)).toBeNull();
	});

	it('does not send a warning before a member has used any time', () => {
		const usage = createActivityUsage(10, false, false, new Date(2026, 10, 11, 10, 0, 0));

		expect(dueActivityAlert(usage)).toBeNull();
	});
});
