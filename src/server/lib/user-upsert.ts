import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/server/db";
import { users } from "#/server/db/schema";
import { audit } from "#/server/lib/audit";
import { enrichUserProfile } from "#/server/lib/enrichment";
import { trackEvent } from "#/server/lib/telemetry";

/** The directory-person shape every inline-create flow validates — one schema, many callers. */
export const DirectoryUserSchema = z.object({
	entraId: z.string(),
	displayName: z.string(),
	email: z.string(),
	jobTitle: z.string().nullable().optional(),
	department: z.string().nullable().optional(),
	officeLocation: z.string().nullable().optional(),
});

export type DirectoryUserInput = z.infer<typeof DirectoryUserSchema>;

/**
 * Insert a User from a directory record and return their id. Shared by the
 * owner-driven roster/watcher/assignment inline-create paths — CONTEXT widens
 * the add-people gate beyond admins, so Owners can pull someone in from Entra
 * without an admin first.
 *
 * The created User defaults to role `submitter`: roster membership, not a stored
 * role, is what grants capability (ADR-0003). An existing User's role AND active
 * flag are left untouched (this is "add them to my team", never a promotion or a
 * reactivation) — callers must check the returned `active` and refuse
 * deactivated users; only the admin Users page reactivates.
 */
export async function upsertDirectoryUser(
	input: DirectoryUserInput,
	actorId: string,
): Promise<{ id: string; created: boolean; active: boolean }> {
	const existing = await db.query.users.findFirst({
		where: eq(users.entraId, input.entraId),
		columns: { id: true, active: true },
	});

	if (existing) {
		await db
			.update(users)
			.set({
				displayName: input.displayName,
				email: input.email,
				jobTitle: input.jobTitle ?? null,
				department: input.department ?? null,
				officeLocation: input.officeLocation ?? null,
				updatedAt: new Date(),
			})
			.where(eq(users.id, existing.id));
		enrichUserProfile(existing.id).catch(() => {});
		return { id: existing.id, created: false, active: existing.active };
	}

	const [created] = await db
		.insert(users)
		.values({
			entraId: input.entraId,
			displayName: input.displayName,
			email: input.email,
			jobTitle: input.jobTitle ?? null,
			department: input.department ?? null,
			officeLocation: input.officeLocation ?? null,
			role: "submitter",
			source: "graph",
		})
		.returning({ id: users.id });

	enrichUserProfile(created.id).catch(() => {});
	trackEvent("UserAdded", { userId: created.id, role: "submitter" });
	audit({
		actorId,
		action: "user.added",
		resourceType: "user",
		resourceId: created.id,
		details: { name: input.displayName, email: input.email, via: "roster_inline_create" },
	});

	return { id: created.id, created: true, active: true };
}
