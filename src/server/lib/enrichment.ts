import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "#/server/db";
import { users } from "#/server/db/schema";
import { getUserManager, getUserPhoto, getUserProfile } from "#/server/lib/graph";

const ENRICHMENT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PHOTO_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Azure App Service with WEBSITE_RUN_FROM_PACKAGE=1 has a read-only app dir.
// /home/ is persistent and writable. Locally, use ./photos/.
const PHOTOS_DIR = process.env.HOME?.startsWith("/home")
	? "/home/photos"
	: join(process.cwd(), "photos");

/**
 * Enrich a user's profile via Graph API if stale (>24 hours).
 * Fetches profile fields, manager, and optionally photo.
 * No-ops in dev mode (Graph client returns null).
 */
export async function enrichUserProfile(userId: string): Promise<void> {
	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: {
			id: true,
			entraId: true,
			profileEnrichedAt: true,
			photoLastFetched: true,
		},
	});

	if (!user) return;

	const now = new Date();
	const enrichedAt = user.profileEnrichedAt?.getTime() ?? 0;
	if (now.getTime() - enrichedAt < ENRICHMENT_TTL_MS) return;

	// Parallel Graph calls: profile + manager
	const [profile, manager] = await Promise.all([
		getUserProfile(user.entraId),
		getUserManager(user.entraId),
	]);

	// No Graph client (dev mode) — skip
	if (!profile) return;

	// Resolve managerId if the manager has a ThoughtBox user record
	let managerId: string | null = null;
	if (manager) {
		const managerUser = await db.query.users.findFirst({
			where: eq(users.entraId, manager.entraId),
			columns: { id: true },
		});
		managerId = managerUser?.id ?? null;
	}

	const updates: Record<string, unknown> = {
		displayName: profile.displayName,
		email: profile.email,
		jobTitle: profile.jobTitle,
		department: profile.department,
		officeLocation: profile.officeLocation,
		managerEntraId: manager?.entraId ?? null,
		managerDisplayName: manager?.displayName ?? null,
		managerId,
		profileEnrichedAt: now,
		updatedAt: now,
	};

	// Fetch photo if stale (>7 days) or never fetched
	const photoFetchedAt = user.photoLastFetched?.getTime() ?? 0;
	if (now.getTime() - photoFetchedAt >= PHOTO_TTL_MS) {
		const photo = await getUserPhoto(user.entraId);
		if (photo) {
			await mkdir(PHOTOS_DIR, { recursive: true });
			const filename = `${user.entraId}.jpg`;
			await writeFile(join(PHOTOS_DIR, filename), photo);
			updates.photoUrl = `/api/users/${user.id}/photo`;
		}
		updates.photoLastFetched = now;
	}

	await db.update(users).set(updates).where(eq(users.id, user.id));
}
