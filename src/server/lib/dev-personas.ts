import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "#/server/db";
import { categories, categoryContributors, ideas, users } from "#/server/db/schema";
import { personasEnabled } from "#/server/lib/app-env";

/**
 * Local development: NODE_ENV is "development"/"test", Easy Auth is mocked, so
 * the persona switcher works without an admin gate (it's your own machine).
 */
export function isDevEnv(): boolean {
	return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

/**
 * Whether the persona switcher should be available at all — either locally
 * (`isDevEnv`) or in a deployed dev env (`personasEnabled`). In a deployed dev
 * env the actual identity *override* is additionally admin-gated by
 * `resolvePersonaOverride`; this just controls whether the personas are listed.
 */
export function personaSwitchingEnabled(): boolean {
	return isDevEnv() || personasEnabled;
}

export type PersonaIntent = "admin" | "owner" | "contributor" | "submitter";

export interface DevPersona {
	entraId: string;
	displayName: string;
	email: string;
	/** Stored role — only `admin` is explicit; owner/contributor are derived from relationships. */
	role: "submitter" | "admin";
	intent: PersonaIntent;
	blurb: string;
}

/** The curated set of personas the switcher offers, one per effective role. */
export const DEV_PERSONAS: DevPersona[] = [
	{
		entraId: "dev-admin-1",
		displayName: "Michael",
		email: "dev@localhost",
		role: "admin",
		intent: "admin",
		blurb: "Full admin — program dashboard, all admin pages.",
	},
	{
		entraId: "dev-owner-1",
		displayName: "Olive Owner",
		email: "dev-owner@localhost",
		role: "submitter",
		intent: "owner",
		blurb: "Owns a category — Dashboard, All Ideas, My Queue, My Categories.",
	},
	{
		entraId: "dev-contributor-1",
		displayName: "Casey Watcher",
		email: "dev-contributor@localhost",
		role: "submitter",
		intent: "contributor",
		blurb: "On a roster — sees the team's ideas, reviews assigned ones.",
	},
	{
		entraId: "dev-submitter-1",
		displayName: "Sam Submitter",
		email: "dev-submitter@localhost",
		role: "submitter",
		intent: "submitter",
		blurb: "Plain employee — Submit and My Ideas.",
	},
];

/** Easy Auth-style claims for a dev persona (so the middleware doesn't clobber the name). */
export function devClaimsFor(entraId: string): {
	entraId: string;
	email: string;
	displayName: string;
} {
	const p = DEV_PERSONAS.find((x) => x.entraId === entraId);
	return p
		? { entraId: p.entraId, email: p.email, displayName: p.displayName }
		: { entraId, email: `${entraId}@localhost`, displayName: entraId };
}

export interface DevPersonaStatus extends DevPersona {
	categoryName: string | null;
}

/**
 * Memoize the (idempotent) materialization. Both the switcher's list call and
 * every impersonated request route through `ensureDevPersonas`, and each cold
 * call costs ~10 DB round-trips. The personas and their relationships don't
 * change within a session, so a short TTL keeps a deployed dev env snappy while
 * staying fresh enough for a test-only tool.
 */
let ensuredCache: { at: number; data: DevPersonaStatus[] } | null = null;
const ENSURE_TTL_MS = 60_000;

/**
 * Idempotently ensure the dev personas exist with the relationships that make
 * each role meaningful: the owner persona owns a real category (the unowned one
 * with the most ideas, so the views aren't empty), and the contributor sits on
 * that category's roster. Returns the personas with the resolved category name.
 */
export async function ensureDevPersonas(): Promise<DevPersonaStatus[]> {
	if (!personaSwitchingEnabled()) return [];
	if (ensuredCache && Date.now() - ensuredCache.at < ENSURE_TTL_MS) {
		return ensuredCache.data;
	}

	// Upsert each persona user (by entraId).
	for (const p of DEV_PERSONAS) {
		const existing = await db.query.users.findFirst({
			where: eq(users.entraId, p.entraId),
			columns: { id: true },
		});
		if (existing) {
			await db
				.update(users)
				.set({
					role: p.role,
					active: true,
					displayName: p.displayName,
					email: p.email,
					updatedAt: new Date(),
				})
				.where(eq(users.id, existing.id));
		} else {
			await db.insert(users).values({
				entraId: p.entraId,
				displayName: p.displayName,
				email: p.email,
				role: p.role,
				source: "login",
				firstSeen: new Date(),
			});
		}
	}

	const owner = await db.query.users.findFirst({
		where: eq(users.entraId, "dev-owner-1"),
		columns: { id: true },
	});
	const contributor = await db.query.users.findFirst({
		where: eq(users.entraId, "dev-contributor-1"),
		columns: { id: true },
	});

	// Give the owner persona a category: reuse one they already own, else adopt the
	// unowned category with the most ideas so the owner views have real content.
	let cat = owner
		? await db.query.categories.findFirst({
				where: and(
					eq(categories.ownerId, owner.id),
					eq(categories.active, true),
					isNull(categories.deletedAt),
				),
				columns: { id: true, name: true },
			})
		: null;

	// Local convenience only: auto-adopt the unowned category with the most ideas
	// so the owner views aren't empty. NEVER in a deployed dev env — there the dev
	// seed assigns the owner persona a dedicated category, so we don't silently
	// reassign a real UAT category out from under a tester.
	if (!cat && owner && isDevEnv()) {
		const [pick] = await db
			.select({ id: categories.id, name: categories.name, n: count(ideas.id) })
			.from(categories)
			.leftJoin(ideas, eq(ideas.categoryId, categories.id))
			.where(
				and(
					isNull(categories.ownerId),
					eq(categories.active, true),
					eq(categories.routingType, "thoughtbox"),
					isNull(categories.deletedAt),
				),
			)
			.groupBy(categories.id)
			.orderBy(desc(count(ideas.id)))
			.limit(1);
		if (pick) {
			await db.update(categories).set({ ownerId: owner.id }).where(eq(categories.id, pick.id));
			cat = { id: pick.id, name: pick.name };
		}
	}

	// Put the contributor persona on that category's roster.
	if (cat && contributor) {
		await db
			.insert(categoryContributors)
			.values({ categoryId: cat.id, userId: contributor.id })
			.onConflictDoNothing();
	}

	const data = DEV_PERSONAS.map((p) => ({
		...p,
		categoryName: p.intent === "owner" || p.intent === "contributor" ? (cat?.name ?? null) : null,
	}));
	ensuredCache = { at: Date.now(), data };
	return data;
}
