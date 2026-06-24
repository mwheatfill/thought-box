import { eq } from "drizzle-orm";
import { db } from "#/server/db";
import { users } from "#/server/db/schema";
import { audit } from "#/server/lib/audit";
import { enrichUserProfile } from "#/server/lib/enrichment";
import { trackEvent } from "#/server/lib/telemetry";

export interface DirectoryUserInput {
	entraId: string;
	displayName: string;
	email: string;
	jobTitle?: string | null;
	department?: string | null;
	officeLocation?: string | null;
}

/**
 * Insert (or reactivate) a User from a directory record and return their id.
 * Shared by the owner-driven roster/watcher inline-create paths — CONTEXT widens
 * the add-people gate beyond admins, so Owners can pull someone in from Entra
 * without an admin first.
 *
 * The created User defaults to role `submitter`: roster membership, not a stored
 * role, is what grants Contributor capability (ADR-0003). An existing User's role
 * is left untouched here (this is "add them to my team", never a promotion).
 */
export async function upsertDirectoryUser(
	input: DirectoryUserInput,
	actorId: string,
): Promise<{ id: string; created: boolean }> {
	const existing = await db.query.users.findFirst({
		where: eq(users.entraId, input.entraId),
		columns: { id: true },
	});

	if (existing) {
		await db
			.update(users)
			.set({
				active: true,
				displayName: input.displayName,
				email: input.email,
				jobTitle: input.jobTitle ?? null,
				department: input.department ?? null,
				officeLocation: input.officeLocation ?? null,
				updatedAt: new Date(),
			})
			.where(eq(users.id, existing.id));
		enrichUserProfile(existing.id).catch(() => {});
		return { id: existing.id, created: false };
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

	return { id: created.id, created: true };
}
