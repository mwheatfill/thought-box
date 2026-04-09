export const STATUS_LABELS = {
	new: "New",
	under_review: "Under Review",
	accepted: "Accepted",
	in_progress: "In Progress",
	implemented: "Implemented",
	declined: "Declined",
	redirected: "Redirected",
} as const;

export type IdeaStatus = keyof typeof STATUS_LABELS;

export const ROLE_LABELS = {
	submitter: "Submitter",
	leader: "Leader",
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
