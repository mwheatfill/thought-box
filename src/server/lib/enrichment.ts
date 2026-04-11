import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "#/server/db";
import { users } from "#/server/db/schema";
import { uploadBlob } from "#/server/lib/blob";
import { getUserManager, getUserPhoto, getUserProfile } from "#/server/lib/graph";

const ENRICHMENT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PHOTO_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Filesystem fallback for local dev (no Blob Storage)
const isAzure = process.cwd().startsWith("/home/site");
const PHOTOS_DIR = isAzure ? "/home/photos" : join(process.cwd(), "photos");

/**
 * Force-run enrichment and return a diagnostic log of each step.
 * Used by the admin settings page to debug enrichment issues.
 */
export async function diagnoseEnrichment(userId: string): Promise<string[]> {
	const log: string[] = [];

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

	if (!user) {
		log.push("ERROR: User not found in database");
		return log;
	}
	log.push(
		`User: ${user.entraId}, photoUrl=${user.photoUrl ?? "null"}, enrichedAt=${user.profileEnrichedAt?.toISOString() ?? "never"}`,
	);

	try {
		log.push("Fetching profile from Graph...");
		const profile = await getUserProfile(user.entraId);
		if (!profile) {
			log.push("ERROR: getUserProfile returned null (Graph client not configured)");
			return log;
		}
		log.push(
			`Profile: ${profile.displayName}, dept=${profile.department}, office=${profile.officeLocation}`,
		);
	} catch (err) {
		log.push(`ERROR in getUserProfile: ${err instanceof Error ? err.message : String(err)}`);
		return log;
	}

	try {
		log.push("Fetching manager from Graph...");
		const manager = await getUserManager(user.entraId);
		log.push(manager ? `Manager: ${manager.displayName} (${manager.entraId})` : "No manager set");
	} catch (err) {
		log.push(`ERROR in getUserManager: ${err instanceof Error ? err.message : String(err)}`);
	}

	try {
		log.push("Fetching photo from Graph...");
		const photo = await getUserPhoto(user.entraId);
		if (photo) {
			log.push(`Photo: ${photo.length} bytes`);
			const filename = `${user.entraId}.jpg`;
			const blobUrl = await uploadBlob("photos", filename, photo, "image/jpeg");
			if (blobUrl) {
				log.push(`Uploaded to Blob: ${filename}`);
			} else {
				log.push("Blob Storage not configured, using filesystem");
				await mkdir(PHOTOS_DIR, { recursive: true });
				await writeFile(join(PHOTOS_DIR, filename), photo);
				log.push(`Written to filesystem: ${join(PHOTOS_DIR, filename)}`);
			}
			const photoUrl = `/api/users/${user.id}/photo`;
			await db
				.update(users)
				.set({
					photoUrl,
					photoLastFetched: new Date(),
					profileEnrichedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(users.id, user.id));
			log.push(`DB updated: photoUrl=${photoUrl}`);
		} else {
			log.push("Photo: null (no photo or error)");
		}
	} catch (err) {
		log.push(`ERROR in photo step: ${err instanceof Error ? err.message : String(err)}`);
	}

	return log;
}

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
			const filename = `${user.entraId}.jpg`;

			// Try Blob Storage first, filesystem fallback for local dev
			const blobUrl = await uploadBlob("photos", filename, photo, "image/jpeg");
			if (blobUrl) {
				console.log(`[enrichment] Photo uploaded to Blob: ${filename} (${photo.length} bytes)`);
			} else {
				await mkdir(PHOTOS_DIR, { recursive: true });
				await writeFile(join(PHOTOS_DIR, filename), photo);
				console.log(`[enrichment] Photo saved to filesystem: ${filename} (${photo.length} bytes)`);
			}

			updates.photoUrl = `/api/users/${user.id}/photo`;
			updates.photoLastFetched = now;
		} else {
			console.log("[enrichment] No photo returned from Graph");
		}
	}

	await db.update(users).set(updates).where(eq(users.id, user.id));
	console.log(
		`[enrichment] Done for ${user.entraId}, photoUrl=${updates.photoUrl ?? user.photoUrl ?? "none"}`,
	);
}
