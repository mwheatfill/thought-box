export const STATUS_LABELS = {
	new: "New",
	under_review: "Under Review",
	accepted: "Accepted",
	declined: "Declined",
	redirected: "Redirected",
} as const;

export type IdeaStatus = keyof typeof STATUS_LABELS;

export const ROLE_LABELS = {
	submitter: "Submitter",
	owner: "Owner",
	admin: "Admin",
} as const;

export type UserRole = keyof typeof ROLE_LABELS;

export const IMPACT_AREAS = {
	cost: "Cost",
	time: "Time",
	safety: "Safety",
	customer: "Customer",
	culture: "Culture",
} as const;

export type ImpactArea = keyof typeof IMPACT_AREAS;

export const REASSIGNMENT_REASONS = {
	internal_department: "Internal department reassignment",
	improperly_assigned: "Improperly assigned",
} as const;

export type ReassignmentReason = keyof typeof REASSIGNMENT_REASONS;

export const DECLINE_REASONS = {
	already_in_progress: "Already in progress",
	not_feasible: "Not feasible at this time",
	not_aligned: "Not aligned with priorities",
	not_thoughtbox: "Not a ThoughtBox idea",
} as const;

export type DeclineReason = keyof typeof DECLINE_REASONS;

export const OPEN_STATUSES = ["new", "under_review"] as const;
/** Statuses where the owner's identity is visible to submitters */
export const REVIEWED_STATUSES = ["under_review", "accepted"] as const;
/** Statuses that close an idea (user-initiated terminal states) */
export const CLOSED_STATUSES = ["accepted", "declined"] as const;
/** Statuses that lock an idea from further edits (includes AI-routed redirects) */
export const LOCKED_STATUSES = ["accepted", "declined", "redirected"] as const;

export type LockedStatus = (typeof LOCKED_STATUSES)[number];

export function isOpenStatus(s: string): boolean {
	return (OPEN_STATUSES as readonly string[]).includes(s);
}

export function isLockedStatus(s: string): boolean {
	return (LOCKED_STATUSES as readonly string[]).includes(s);
}

export const KPI_COLORS = {
	amber: { bg: "bg-amber-100 dark:bg-amber-900/30", icon: "text-amber-600 dark:text-amber-400" },
	blue: { bg: "bg-blue-100 dark:bg-blue-900/30", icon: "text-blue-600 dark:text-blue-400" },
	emerald: {
		bg: "bg-emerald-100 dark:bg-emerald-900/30",
		icon: "text-emerald-600 dark:text-emerald-400",
	},
	red: { bg: "bg-red-100 dark:bg-red-900/30", icon: "text-red-600 dark:text-red-400" },
	purple: {
		bg: "bg-purple-100 dark:bg-purple-900/30",
		icon: "text-purple-600 dark:text-purple-400",
	},
	green: { bg: "bg-green-100 dark:bg-green-900/30", icon: "text-green-600 dark:text-green-400" },
} as const;

export type KpiColor = keyof typeof KPI_COLORS;
