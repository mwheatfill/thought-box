import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { OPEN_STATUSES } from "#/lib/constants";
import { db } from "#/server/db";
import { categories, categoryContributors, ideaEvents, ideas, users } from "#/server/db/schema";
import {
	businessDaysRemaining,
	calculateSlaStatus,
	summarizeReviewCompliance,
} from "#/server/lib/sla";
import { adminMiddleware, authMiddleware } from "#/server/middleware/auth";

// ── Scope helpers (category-centric, ADR-0001/0002) ───────────────────────

/** Sub-select of the live (active, non-deleted) Category ids a user owns. */
const ownedCategoryIds = (userId: string) =>
	db
		.select({ id: categories.id })
		.from(categories)
		.where(
			and(
				eq(categories.ownerId, userId),
				eq(categories.active, true),
				isNull(categories.deletedAt),
			),
		);

/** Sub-select of the live Category ids a user is a roster Contributor on. */
const rosterCategoryIds = (userId: string) =>
	db
		.select({ id: categoryContributors.categoryId })
		.from(categoryContributors)
		.innerJoin(categories, eq(categoryContributors.categoryId, categories.id))
		.where(
			and(
				eq(categoryContributors.userId, userId),
				eq(categories.active, true),
				isNull(categories.deletedAt),
			),
		);

/**
 * Every idea in the user's categories — those they own OR contribute to — plus
 * ideas assigned to them directly (assignment confers ownership, so an
 * assignment-only Owner's Dashboard and All Ideas must show their work). The
 * "accountability scope" behind the Dashboard summary and the All Ideas table.
 */
function inMyCategories(userId: string) {
	return or(
		inArray(ideas.categoryId, ownedCategoryIds(userId)),
		inArray(ideas.categoryId, rosterCategoryIds(userId)),
		eq(ideas.assignedReviewerId, userId),
	);
}

/**
 * Ideas where the user is the **active reviewer** — the "what's on my plate"
 * set behind My Queue: ideas explicitly assigned to them, OR unassigned ideas in
 * a Category they own (they're the default reviewer until they delegate).
 */
function activeReviewerIsMe(userId: string) {
	return or(
		eq(ideas.assignedReviewerId, userId),
		and(inArray(ideas.categoryId, ownedCategoryIds(userId)), isNull(ideas.assignedReviewerId)),
	);
}

/** Shared row shape for the owner/contributor idea tables (reviewer-enriched). */
async function loadReviewerIdeaRows(where: ReturnType<typeof or>) {
	const result = await db.query.ideas.findMany({
		where,
		orderBy: (i, { asc }) => [asc(i.slaDueDate)],
		with: {
			category: {
				columns: { name: true },
				with: { owner: { columns: { id: true, displayName: true, photoUrl: true } } },
			},
			submitter: { columns: { id: true, displayName: true, photoUrl: true } },
			assignedReviewer: { columns: { id: true, displayName: true, photoUrl: true } },
		},
	});

	return result.map((idea) => {
		const daysRemaining = businessDaysRemaining(idea.slaDueDate);
		const reviewer = idea.assignedReviewer ?? idea.category.owner;
		return {
			id: idea.id,
			submissionId: idea.submissionId,
			title: idea.title,
			status: idea.status,
			categoryName: idea.category.name,
			submitterId: idea.submitter.id,
			submitterName: idea.submitter.displayName,
			submitterPhotoUrl: idea.submitter.photoUrl,
			activeReviewerId: reviewer?.id ?? null,
			activeReviewerName: reviewer?.displayName ?? "Unassigned",
			activeReviewerPhotoUrl: reviewer?.photoUrl ?? null,
			isDelegated: !!idea.assignedReviewerId,
			impactArea: idea.impactArea,
			submittedAt: idea.submittedAt.toISOString(),
			slaDueDate: idea.slaDueDate?.toISOString() ?? null,
			slaDaysRemaining: daysRemaining,
			slaStatus: calculateSlaStatus(idea.status, daysRemaining),
		};
	});
}

/** Open/overdue/closed/total counts over a scope. */
async function loadScopeStats(where: ReturnType<typeof or>) {
	const rows = await db.query.ideas.findMany({
		where,
		columns: { status: true, slaDueDate: true },
	});
	const open = rows.filter((i) => (OPEN_STATUSES as readonly string[]).includes(i.status));
	const overdue = open.filter((i) => {
		const d = businessDaysRemaining(i.slaDueDate);
		return d !== null && d <= 0;
	});
	return {
		openCount: open.length,
		overdueCount: overdue.length,
		closedCount: rows.length - open.length,
		totalAssigned: rows.length,
	};
}

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

// ── My Queue: ideas where I'm the active reviewer ─────────────────────────

export const getAssignedIdeas = createServerFn()
	.middleware([authMiddleware])
	.handler(async ({ context }) => loadReviewerIdeaRows(activeReviewerIsMe(context.user.id)));

export const getOwnerStats = createServerFn()
	.middleware([authMiddleware])
	.handler(async ({ context }) => loadScopeStats(activeReviewerIsMe(context.user.id)));

// ── All Ideas: everything in my categories (owned ∪ roster) ───────────────

export const getCategoryIdeas = createServerFn()
	.middleware([authMiddleware])
	.handler(async ({ context }) => loadReviewerIdeaRows(inMyCategories(context.user.id)));

export const getCategoryStats = createServerFn()
	.middleware([authMiddleware])
	.handler(async ({ context }) => loadScopeStats(inMyCategories(context.user.id)));

// ── Dashboard summary: my categories, broken down per category ────────────

export const getCategorySummary = createServerFn()
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const userId = context.user.id;

		// The categories I own or contribute to, with my relationship to each.
		const [owned, roster] = await Promise.all([
			db.query.categories.findMany({
				where: (c, { and: a, eq: e, isNull: n }) =>
					a(e(c.ownerId, userId), e(c.active, true), n(c.deletedAt)),
				columns: { id: true, name: true },
			}),
			db.query.categoryContributors.findMany({
				where: eq(categoryContributors.userId, userId),
				with: { category: { columns: { id: true, name: true, active: true, deletedAt: true } } },
			}),
		]);

		const mine = new Map<string, { id: string; name: string; role: "owner" | "contributor" }>();
		for (const c of owned) mine.set(c.id, { id: c.id, name: c.name, role: "owner" });
		for (const r of roster) {
			const c = r.category;
			if (c?.active && !c.deletedAt && !mine.has(c.id)) {
				mine.set(c.id, { id: c.id, name: c.name, role: "contributor" });
			}
		}
		const ids = [...mine.keys()];

		const totals = await loadScopeStats(inMyCategories(userId));
		if (ids.length === 0) {
			return { totals, categories: [] as CategorySummaryRow[] };
		}

		// Per-category open/overdue counts in one pass.
		const open = await db.query.ideas.findMany({
			where: and(inArray(ideas.categoryId, ids), inArray(ideas.status, [...OPEN_STATUSES])),
			columns: { categoryId: true, slaDueDate: true },
		});
		const byCat = new Map<string, { open: number; overdue: number }>();
		for (const i of open) {
			const e = byCat.get(i.categoryId) ?? { open: 0, overdue: 0 };
			e.open += 1;
			const d = businessDaysRemaining(i.slaDueDate);
			if (d !== null && d <= 0) e.overdue += 1;
			byCat.set(i.categoryId, e);
		}

		const categories: CategorySummaryRow[] = [...mine.values()]
			.map((c) => ({
				id: c.id,
				name: c.name,
				role: c.role,
				openCount: byCat.get(c.id)?.open ?? 0,
				overdueCount: byCat.get(c.id)?.overdue ?? 0,
			}))
			.sort((a, b) => b.openCount - a.openCount || a.name.localeCompare(b.name));

		return { totals, categories };
	});

interface CategorySummaryRow {
	id: string;
	name: string;
	role: "owner" | "contributor";
	openCount: number;
	overdueCount: number;
}

// ── Admin: Dashboard Stats ────────────────────────────────────────────────

export const getDashboardStats = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const now = new Date();
		const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
		const startOfYear = new Date(now.getFullYear(), 0, 1);

		const allIdeas = await db.query.ideas.findMany({
			columns: {
				id: true,
				status: true,
				slaDueDate: true,
				submittedAt: true,
				closedAt: true,
			},
		});

		// First move to Under Review per idea IN THE CURRENT SLA CYCLE (mirrors
		// idea_report's review_sla_met). Reopen resets slaStartedAt, so a
		// pre-reopen review must not satisfy the fresh clock.
		const firstReviews = await db
			.select({
				ideaId: ideaEvents.ideaId,
				firstReviewedAt: sql<string>`min(${ideaEvents.createdAt})`,
			})
			.from(ideaEvents)
			.innerJoin(ideas, eq(ideaEvents.ideaId, ideas.id))
			.where(
				and(
					eq(ideaEvents.eventType, "status_changed"),
					eq(ideaEvents.newValue, "under_review"),
					gte(ideaEvents.createdAt, sql`coalesce(${ideas.slaStartedAt}, ${ideas.submittedAt})`),
				),
			)
			.groupBy(ideaEvents.ideaId);
		const firstReviewedByIdea = new Map(
			firstReviews.map((r) => [r.ideaId, new Date(r.firstReviewedAt)]),
		);

		const thisMonth = allIdeas.filter((i) => i.submittedAt >= startOfMonth);
		const thisYear = allIdeas.filter((i) => i.submittedAt >= startOfYear);

		const openStatuses = ["new", "under_review"];
		const openIdeas = allIdeas.filter((i) => openStatuses.includes(i.status));
		const overdueOpen = openIdeas.filter((i) => {
			const days = businessDaysRemaining(i.slaDueDate);
			return days !== null && days <= 0;
		});

		// SLA compliance — real math (R29): reviewed within the review SLA; ideas
		// still New past their due date count as breaches in progress.
		const compliance = summarizeReviewCompliance(
			allIdeas.map((i) => ({
				status: i.status,
				slaDueDate: i.slaDueDate,
				closedAt: i.closedAt,
				firstReviewedAt: firstReviewedByIdea.get(i.id) ?? null,
			})),
		);

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
			slaCompliancePercent: compliance.percent,
		};
	});

// ── Admin: All Ideas (paginated) ──────────────────────────────────────────

export const getAllIdeas = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const result = await db.query.ideas.findMany({
			orderBy: (i, { desc }) => [desc(i.submittedAt)],
			with: {
				category: {
					columns: { name: true },
					// Accountable Owner derives from the Category (ADR-0001).
					with: { owner: { columns: { id: true, displayName: true } } },
				},
				submitter: { columns: { id: true, displayName: true, photoUrl: true } },
				// Optional assigned reviewer — the active reviewer when present.
				assignedReviewer: { columns: { id: true, displayName: true } },
			},
		});

		return result.map((idea) => {
			const daysRemaining = businessDaysRemaining(idea.slaDueDate);
			// The active reviewer (assignment if present, else the Category Owner)
			// is what the "owner" column shows.
			const activeReviewer = idea.assignedReviewer ?? idea.category.owner;
			return {
				id: idea.id,
				submissionId: idea.submissionId,
				title: idea.title,
				description: idea.description,
				status: idea.status,
				categoryName: idea.category.name,
				submitterId: idea.submitter.id,
				submitterName: idea.submitter.displayName,
				submitterPhotoUrl: idea.submitter.photoUrl,
				assignedOwnerId: activeReviewer?.id ?? null,
				assignedOwnerName: activeReviewer?.displayName ?? null,
				impactArea: idea.impactArea,
				submittedAt: idea.submittedAt.toISOString(),
				slaDueDate: idea.slaDueDate?.toISOString() ?? null,
				slaDaysRemaining: daysRemaining,
				slaStatus: calculateSlaStatus(idea.status, daysRemaining),
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

// ── Admin: Submissions by Department ──────────────────────────────────────

export const getSubmissionsByDepartment = createServerFn()
	.middleware([adminMiddleware])
	.handler(async () => {
		const result = await db
			.select({
				department: sql<string>`coalesce(${users.department}, 'Unknown')`,
				count: count(),
			})
			.from(ideas)
			.innerJoin(users, eq(ideas.submitterId, users.id))
			.groupBy(sql`coalesce(${users.department}, 'Unknown')`)
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
			actorId: e.actorId,
			actorName: e.actor.displayName,
			ideaSubmissionId: e.idea.submissionId,
			ideaTitle: e.idea.title,
			oldValue: e.oldValue,
			newValue: e.newValue,
			note: e.note,
			createdAt: e.createdAt.toISOString(),
		}));
	});
