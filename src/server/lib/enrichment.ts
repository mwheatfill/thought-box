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
			photoUrl: true,
			profileEnrichedAt: true,
			photoLastFetched: true,
		},
	});

	if (!user) return;

	const now = new Date();
	const enrichedAt = user.profileEnrichedAt?.getTime() ?? 0;
	const profileStale = now.getTime() - enrichedAt >= ENRICHMENT_TTL_MS;
	const photoMissing = !user.photoUrl;
	const photoStale = now.getTime() - (user.photoLastFetched?.getTime() ?? 0) >= PHOTO_TTL_MS;

	// Nothing to do
	if (!profileStale && !photoMissing && !photoStale) return;

	console.log(
		`[enrichment] Starting for ${user.entraId} (profile=${profileStale ? "stale" : "ok"}, photo=${photoMissing ? "missing" : photoStale ? "stale" : "ok"})`,
	);

	const updates: Record<string, unknown> = { updatedAt: now };

	// Profile + manager enrichment (24hr TTL)
	if (profileStale) {
		const [profile, manager] = await Promise.all([
			getUserProfile(user.entraId),
			getUserManager(user.entraId),
		]);

		if (!profile) {
			console.log("[enrichment] No Graph client (dev mode), skipping");
			return;
		}

		console.log(`[enrichment] Got profile: ${profile.displayName}, ${profile.department}`);

		let managerId: string | null = null;
		if (manager) {
			const managerUser = await db.query.users.findFirst({
				where: eq(users.entraId, manager.entraId),
				columns: { id: true },
			});
			managerId = managerUser?.id ?? null;
		}

		Object.assign(updates, {
			displayName: profile.displayName,
			email: profile.email,
			jobTitle: profile.jobTitle,
			department: profile.department,
			officeLocation: profile.officeLocation,
			managerEntraId: manager?.entraId ?? null,
			managerDisplayName: manager?.displayName ?? null,
			managerId,
			profileEnrichedAt: now,
		});
	}

	// Photo fetch — retry if missing, refresh if stale
	if (photoMissing || photoStale) {
		const photo = await getUserPhoto(user.entraId);
		if (photo) {
			await mkdir(PHOTOS_DIR, { recursive: true });
			const filename = `${user.entraId}.jpg`;
			const photoPath = join(PHOTOS_DIR, filename);
			await writeFile(photoPath, photo);
			updates.photoUrl = `/api/users/${user.id}/photo`;
			updates.photoLastFetched = now;
			console.log(`[enrichment] Photo saved: ${photoPath} (${photo.length} bytes)`);
		} else {
			// Only set photoLastFetched if we confirmed no photo exists (not on error).
			// getUserPhoto returns null for 404 AND for errors, so we set a short TTL
			// to retry errors sooner. A successful "no photo" returns null with a 404 log.
			console.log("[enrichment] No photo returned from Graph");
		}
	}

	await db.update(users).set(updates).where(eq(users.id, user.id));
	console.log(
		`[enrichment] Done for ${user.entraId}, photoUrl=${updates.photoUrl ?? user.photoUrl ?? "none"}`,
	);
}
