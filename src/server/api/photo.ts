import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "#/server/db";
import { users } from "#/server/db/schema";
import { downloadBlob } from "#/server/lib/blob";

const isAzure = process.cwd().startsWith("/home/site");
const PHOTOS_DIR = isAzure ? "/home/photos" : join(process.cwd(), "photos");

/** Generate an SVG initials avatar with a consistent color derived from the user ID. */
function generateInitialsAvatar(displayName: string, userId: string): string {
	const initials = displayName
		.split(" ")
		.map((n) => n[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();

	let hash = 0;
	for (const char of userId) {
		hash = (hash * 31 + char.charCodeAt(0)) | 0;
	}
	const hue = Math.abs(hash) % 360;
	const bg = `hsl(${hue}, 45%, 55%)`;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
<rect width="128" height="128" fill="${bg}" rx="64"/>
<text x="64" y="64" dy="0.35em" fill="white" font-family="system-ui,sans-serif" font-size="48" font-weight="600" text-anchor="middle">${initials}</text>
</svg>`;
}

/**
 * Handle GET /api/users/:id/photo
 * Tries Blob Storage first, then filesystem fallback, then SVG initials.
 */
export async function handlePhotoRequest(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const match = url.pathname.match(/^\/api\/users\/([^/]+)\/photo$/);
	if (!match) return new Response("Not found", { status: 404 });

	const userId = match[1];

	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { entraId: true, displayName: true, photoUrl: true },
	});

	if (!user) return new Response("Not found", { status: 404 });

	if (user.photoUrl) {
		// Try Blob Storage first
		const blob = await downloadBlob("photos", `${user.entraId}.jpg`);
		if (blob) {
			return new Response(blob.data, {
				headers: {
					"Content-Type": "image/jpeg",
					"Cache-Control": "public, max-age=86400",
				},
			});
		}

		// Filesystem fallback (legacy / local dev)
		try {
			const photoPath = join(PHOTOS_DIR, `${user.entraId}.jpg`);
			const photo = await readFile(photoPath);
			return new Response(photo, {
				headers: {
					"Content-Type": "image/jpeg",
					"Cache-Control": "public, max-age=86400",
				},
			});
		} catch {
			// Fall through to initials
		}
	}

	// Generate initials avatar
	const svg = generateInitialsAvatar(user.displayName, userId);
	return new Response(svg, {
		headers: {
			"Content-Type": "image/svg+xml",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
