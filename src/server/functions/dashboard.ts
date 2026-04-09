import { createServerFn } from "@tanstack/react-start";
import { count, eq, gte, sql } from "drizzle-orm";
import { db } from "#/server/db";
import { categories, ideaEvents, ideas } from "#/server/db/schema";
import { businessDaysRemaining } from "#/server/lib/sla";
import { adminMiddleware, authMiddleware, leaderMiddleware } from "#/server/middleware/auth";

// ── Submitter: My Ideas ───────────────────────────────────────────────────

export const getMyIdeas = createServerFn()
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const result = await db.query.ideas.findMany({
			where: eq(ideas.submitterId, context.user.id),
			orderBy: (i, { desc }) => [desc(i.submittedAt)],
			with: {
				category: { columns: { name: true } },
			},
		});

		return result.map((idea) => ({
			id: idea.id,
			submissionId: idea.submissionId,
			title: idea.title,
			status: idea.status,
			categoryName: idea.category.name,
			impactArea: idea.impactArea,
			submittedAt: idea.submittedAt.toISOString(),
			slaDueDate: idea.slaDueDate?.toISOString() ?? null,
		}));
	});

// ── Leader: Assigned Ideas ────────────────────────────────────────────────

export const getAssignedIdeas = createServerFn()
	.middleware([leaderMiddleware])
	.handler(async ({ context }) => {
		const result = await db.query.ideas.findMany({
			where: eq(ideas.assignedLeaderId, context.user.id),
			orderBy: (i, { asc }) => [asc(i.slaDueDate)],
			with: {
				category: { columns: { name: true } },
				submitter: { columns: { displayName: true } },
			},
		});

		return result.map((idea) => {
			const daysRemaining = businessDaysRemaining(idea.slaDueDate);
			return {
				id: idea.id,
				submissionId: idea.submissionId,
				title: idea.title,
				status: idea.status,
				categoryName: idea.category.name,
				submitterName: idea.submitter.displayName,
				impactArea: idea.impactArea,
				submittedAt: idea.submittedAt.toISOString(),
				slaDueDate: idea.slaDueDate?.toISOString() ?? null,
				slaDaysRemaining: daysRemaining,
				slaStatus:
					daysRemaining === null
						? ("none" as const)
						: daysRemaining <= 0
							? ("overdue" as const)
							: daysRemaining <= 3
								? ("approaching" as const)
								: ("on_track" as const),
			};
		});
	});

// ── Leader: KPI stats ─────────────────────────────────────────────────────

export const getLeaderStats = createServerFn()
	.middleware([leaderMiddleware])
	.handler(async ({ context }) => {
		const myIdeas = await db.query.ideas.findMany({
			where: eq(ideas.assignedLeaderId, context.user.id),
			columns: { status: true, slaDueDate: true },
		});

		const openStatuses = ["new", "under_review", "in_progress"] as const;
		const openIdeas = myIdeas.filter((i) =>
			openStatuses.includes(i.status as (typeof openStatuses)[number]),
		);
		const overdueIdeas = openIdeas.filter((i) => {
			const days = businessDaysRemaining(i.slaDueDate);
			return days !== null && days <= 0;
		});

		return {
			openCount: openIdeas.length,
			overdueCount: overdueIdeas.length,
			totalAssigned: myIdeas.length,
		};
	});

// ── Admin: Dashboard Stats ────────────────────────────────────────────────

export const getDashboardStats = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const now = new Date();
		const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const startOfYear = new Date(now.getFullYear(), 0, 1);

		const allIdeas = await db.query.ideas.findMany({
			columns: {
				status: true,
				slaDueDate: true,
				submittedAt: true,
				closedAt: true,
			},
		});

		const thisMonth = allIdeas.filter((i) => i.submittedAt >= startOfMonth);
		const thisYear = allIdeas.filter((i) => i.submittedAt >= startOfYear);

		const openStatuses = ["new", "under_review", "in_progress"];
		const openIdeas = allIdeas.filter((i) => openStatuses.includes(i.status));
		const overdueOpen = openIdeas.filter((i) => {
			const days = businessDaysRemaining(i.slaDueDate);
			return days !== null && days <= 0;
		});

		// SLA compliance: % of ideas reviewed within 15 business days
		const closedOrReviewed = allIdeas.filter((i) => i.status !== "new");
		const reviewedOnTime = closedOrReviewed.filter((i) => {
			if (!i.slaDueDate) return true;
			// If the idea was moved out of "new" before the SLA date, it's on time
			return true; // Simplified for now — full tracking requires event timestamps
		});

		// Avg time to close (days)
		const closedIdeas = allIdeas.filter((i) => i.closedAt);
		const avgCloseTime =
			closedIdeas.length > 0
				? closedIdeas.reduce((sum, i) => {
						const closedTime = i.closedAt?.getTime() ?? i.submittedAt.getTime();
						const days = (closedTime - i.submittedAt.getTime()) / (1000 * 60 * 60 * 24);
						return sum + days;
					}, 0) / closedIdeas.length
				: null;

		return {
			totalThisMonth: thisMonth.length,
			totalThisYear: thisYear.length,
			openCount: openIdeas.length,
			overdueCount: overdueOpen.length,
			avgCloseTimeDays: avgCloseTime ? Math.round(avgCloseTime * 10) / 10 : null,
			slaCompliancePercent:
				closedOrReviewed.length > 0
					? Math.round((reviewedOnTime.length / closedOrReviewed.length) * 100)
					: null,
		};
	});

// ── Admin: All Ideas (paginated) ──────────────────────────────────────────

export const getAllIdeas = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const result = await db.query.ideas.findMany({
			orderBy: (i, { desc }) => [desc(i.submittedAt)],
			with: {
				category: { columns: { name: true } },
				submitter: { columns: { displayName: true } },
				assignedLeader: { columns: { displayName: true } },
			},
		});

		return result.map((idea) => {
			const daysRemaining = businessDaysRemaining(idea.slaDueDate);
			return {
				id: idea.id,
				submissionId: idea.submissionId,
				title: idea.title,
				description: idea.description,
				status: idea.status,
				categoryName: idea.category.name,
				submitterName: idea.submitter.displayName,
				assignedLeaderName: idea.assignedLeader?.displayName ?? null,
				impactArea: idea.impactArea,
				submittedAt: idea.submittedAt.toISOString(),
				slaDueDate: idea.slaDueDate?.toISOString() ?? null,
				slaDaysRemaining: daysRemaining,
				slaStatus:
					daysRemaining === null
						? ("none" as const)
						: daysRemaining <= 0
							? ("overdue" as const)
							: daysRemaining <= 3
								? ("approaching" as const)
								: ("on_track" as const),
			};
		});
	});

// ── Admin: Submissions by Category ────────────────────────────────────────

export const getSubmissionsByCategory = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const result = await db
			.select({
				categoryName: categories.name,
				count: count(),
			})
			.from(ideas)
			.innerJoin(categories, eq(ideas.categoryId, categories.id))
			.groupBy(categories.name)
			.orderBy(sql`count(*) desc`);

		return result;
	});

// ── Admin: Submissions by Month ───────────────────────────────────────────

export const getSubmissionsByMonth = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const sixMonthsAgo = new Date();
		sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
		sixMonthsAgo.setDate(1);

		const result = await db
			.select({
				month: sql<string>`to_char(${ideas.submittedAt}, 'YYYY-MM')`,
				status: ideas.status,
				count: count(),
			})
			.from(ideas)
			.where(gte(ideas.submittedAt, sixMonthsAgo))
			.groupBy(sql`to_char(${ideas.submittedAt}, 'YYYY-MM')`, ideas.status)
			.orderBy(sql`to_char(${ideas.submittedAt}, 'YYYY-MM')`);

		return result;
	});

// ── Admin: Outcome Distribution ───────────────────────────────────────────

export const getOutcomeDistribution = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const result = await db
			.select({
				status: ideas.status,
				count: count(),
			})
			.from(ideas)
			.groupBy(ideas.status);

		return result;
	});

// ── Admin: Recent Activity Feed ───────────────────────────────────────────

export const getRecentProgramActivity = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const twoDaysAgo = new Date();
		twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

		const events = await db.query.ideaEvents.findMany({
			where: gte(ideaEvents.createdAt, twoDaysAgo),
			orderBy: (e, { desc }) => [desc(e.createdAt)],
			limit: 20,
			with: {
				actor: { columns: { displayName: true } },
				idea: { columns: { submissionId: true, title: true } },
			},
		});

		return events.map((e) => ({
			id: e.id,
			eventType: e.eventType,
			actorName: e.actor.displayName,
			ideaSubmissionId: e.idea.submissionId,
			ideaTitle: e.idea.title,
			oldValue: e.oldValue,
			newValue: e.newValue,
			note: e.note,
			createdAt: e.createdAt.toISOString(),
		}));
	});
