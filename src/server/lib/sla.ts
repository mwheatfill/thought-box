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

export type SlaStatus = "on_track" | "approaching" | "overdue" | "none";

/**
 * Bucket an idea's review SLA into a status label.
 *
 * Closed ideas (accepted/declined) always return "none" regardless of their
 * slaDueDate — the SLA only meaningfully applies while an idea is open.
 * Historical slaDueDate values stay on the row for audit but never count as
 * overdue once a decision has been recorded.
 */
export function calculateSlaStatus(ideaStatus: string, daysRemaining: number | null): SlaStatus {
	if (ideaStatus === "accepted" || ideaStatus === "declined" || ideaStatus === "redirected") {
		return "none";
	}
	if (daysRemaining === null) return "none";
	if (daysRemaining <= 0) return "overdue";
	if (daysRemaining <= 3) return "approaching";
	return "on_track";
}

export type SlaAction = "change_category" | "assign_reviewer" | "category_owner_change" | "reopen";

/**
 * Whether an action restarts an idea's SLA clock under the category-centric
 * model (ADR-0001 and the grilled rules):
 *
 * - **Change Category** → YES. The work has been re-scoped to a different team;
 *   the new Owner's clock starts when they receive it.
 * - **Reopen** → YES. A closed idea returning to New is a fresh review.
 * - **Assignment** → NO. Delegating to a reviewer doesn't change who is
 *   accountable, so the clock keeps running.
 * - **Category-owner change** → NO. Same work, new hands — resetting here would
 *   restart the SLA on every idea in a Category whenever it changes ownership.
 */
export function slaResetsOnAction(action: SlaAction): boolean {
	return action === "change_category" || action === "reopen";
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

export interface ReviewComplianceItem {
	status: string;
	slaDueDate: Date | null;
	closedAt: Date | null;
	/**
	 * First move to Under Review IN THE CURRENT SLA CYCLE (>= slaStartedAt), if
	 * any. Callers must exclude pre-reopen reviews — a reopened idea's fresh
	 * clock is only satisfied by a fresh review (idea_report's review_sla_met
	 * applies the same threshold).
	 */
	firstReviewedAt: Date | null;
}

/**
 * Review-SLA compliance: of the ideas whose review clock has concluded — they
 * were reviewed, or they are still New past their review due date (a breach in
 * progress) — the share reviewed on time. Ideas still New with time remaining
 * are excluded; a direct close from New (no Under Review step) counts its
 * close as the review.
 */
export function summarizeReviewCompliance(items: ReviewComplianceItem[]): {
	onTime: number;
	breached: number;
	percent: number | null;
} {
	let onTime = 0;
	let breached = 0;
	for (const i of items) {
		const reviewedAt = i.firstReviewedAt ?? (i.status !== "new" ? i.closedAt : null);
		if (reviewedAt) {
			if (!i.slaDueDate || reviewedAt <= i.slaDueDate) onTime++;
			else breached++;
		} else if (i.status === "new") {
			const days = businessDaysRemaining(i.slaDueDate);
			if (days !== null && days <= 0) breached++;
		}
	}
	const total = onTime + breached;
	return { onTime, breached, percent: total > 0 ? Math.round((onTime / total) * 100) : null };
}
