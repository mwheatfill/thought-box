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

export const OPEN_STATUSES = ["new", "under_review"] as const;

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
