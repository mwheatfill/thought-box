import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "#/server/db";
import { categories, categoryContributors, ideas, users } from "#/server/db/schema";

/**
 * Dev-only persona switching. NEVER active in production: every entry point here
 * is gated by `isDevEnv()`, and in a production Vite build `process.env.NODE_ENV`
 * is statically "production", so these branches compile out / no-op.
 */
export function isDevEnv(): boolean {
	return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
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
		displayName: "Casey Contributor",
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
 * Idempotently ensure the dev personas exist with the relationships that make
 * each role meaningful: the owner persona owns a real category (the unowned one
 * with the most ideas, so the views aren't empty), and the contributor sits on
 * that category's roster. Returns the personas with the resolved category name.
 */
export async function ensureDevPersonas(): Promise<DevPersonaStatus[]> {
	if (!isDevEnv()) return [];

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

	if (!cat && owner) {
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

	return DEV_PERSONAS.map((p) => ({
		...p,
		categoryName: p.intent === "owner" || p.intent === "contributor" ? (cat?.name ?? null) : null,
	}));
}
