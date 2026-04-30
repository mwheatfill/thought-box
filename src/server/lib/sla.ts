/**
 * Add business days to a date, skipping Saturday and Sunday.
 * No holiday calendar for MVP.
 */
export function addBusinessDays(date: Date, days: number): Date {
	const result = new Date(date);
	let added = 0;

	while (added < days) {
		result.setDate(result.getDate() + 1);
		const dayOfWeek = result.getDay();
		if (dayOfWeek !== 0 && dayOfWeek !== 6) {
			added++;
		}
	}

	return result;
}

/**
 * Calculate the SLA due date for an idea.
 * Default: 15 business days from submission.
 */
export function calculateSlaDueDate(submittedAt: Date, businessDays = 15): Date {
	return addBusinessDays(submittedAt, businessDays);
}

/**
 * Count business days elapsed between two dates (skipping weekends).
 * Returns 0 if `end` is before `start`.
 *
 * Inverse of `addBusinessDays`: businessDaysBetween(d, addBusinessDays(d, n)) === n.
 */
export function businessDaysBetween(start: Date, end: Date): number {
	if (end <= start) return 0;
	let count = 0;
	const cursor = new Date(start);
	cursor.setDate(cursor.getDate() + 1);
	while (cursor <= end) {
		const dayOfWeek = cursor.getDay();
		if (dayOfWeek !== 0 && dayOfWeek !== 6) {
			count++;
		}
		cursor.setDate(cursor.getDate() + 1);
	}
	return count;
}

/**
 * Check if an idea is overdue based on its SLA due date.
 */
export function isOverdue(slaDueDate: Date | null): boolean {
	if (!slaDueDate) return false;
	return new Date() > slaDueDate;
}

/**
 * Calculate business days remaining until the SLA due date.
 * Returns negative values if overdue.
 */
export function businessDaysRemaining(slaDueDate: Date | null): number | null {
	if (!slaDueDate) return null;

	const now = new Date();
	const target = new Date(slaDueDate);
	let count = 0;
	const direction = target >= now ? 1 : -1;
	const current = new Date(now);

	while (direction === 1 ? current < target : current > target) {
		current.setDate(current.getDate() + direction);
		const dayOfWeek = current.getDay();
		if (dayOfWeek !== 0 && dayOfWeek !== 6) {
			count += direction;
		}
	}

	return count;
}
