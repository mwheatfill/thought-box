import { eq } from "drizzle-orm";
import { db } from "#/server/db";
import { attachments, ideas } from "#/server/db/schema";
import { audit } from "#/server/lib/audit";
import { downloadBlob, getMaxFileSize, isAllowedType, uploadBlob } from "#/server/lib/blob";

/**
 * Handle POST /api/attachments — upload a file to an idea.
 * Expects multipart/form-data with fields: file, ideaId, userId, messageId (optional)
 */
export async function handleAttachmentUpload(request: Request): Promise<Response> {
	try {
		const formData = await request.formData();
		const file = formData.get("file") as File | null;
		const ideaId = formData.get("ideaId") as string | null;
		const userId = formData.get("userId") as string | null;
		const messageId = (formData.get("messageId") as string) || null;

		if (!file || !ideaId || !userId) {
			return new Response(JSON.stringify({ error: "Missing required fields" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Validate file size
		if (file.size > getMaxFileSize()) {
			return new Response(JSON.stringify({ error: "File too large. Maximum size is 10MB." }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Validate file type
		if (!isAllowedType(file.type)) {
			return new Response(JSON.stringify({ error: "File type not allowed." }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Verify the idea exists
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, ideaId),
			columns: { id: true, submissionId: true, status: true, submitterId: true },
		});
		if (!idea) {
			return new Response(JSON.stringify({ error: "Idea not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Read file buffer and validate magic bytes
		const buffer = Buffer.from(await file.arrayBuffer());

		// Validate magic bytes for images
		if (file.type.startsWith("image/")) {
			try {
				const { fileTypeFromBuffer } = await import("file-type");
				const detected = await fileTypeFromBuffer(buffer);
				if (detected && !isAllowedType(detected.mime)) {
					return new Response(
						JSON.stringify({ error: "File content does not match its extension." }),
						{ status: 400, headers: { "Content-Type": "application/json" } },
					);
				}
			} catch {
				// file-type may not be available in all environments
			}
		}

		// Generate blob name: ideas/{ideaId}/{timestamp}-{filename}
		const blobName = `ideas/${ideaId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

		// Upload to Blob Storage
		await uploadBlob("attachments", blobName, buffer, file.type);

		// Save metadata to DB
		const [attachment] = await db
			.insert(attachments)
			.values({
				ideaId,
				messageId,
				filename: file.name,
				contentType: file.type,
				sizeBytes: file.size,
				blobName,
				uploadedById: userId,
			})
			.returning();

		audit({
			actorId: userId,
			action: "attachment.uploaded",
			resourceType: "attachment",
			resourceId: idea.submissionId,
			details: { filename: file.name, size: file.size, contentType: file.type },
		});

		return new Response(
			JSON.stringify({
				id: attachment.id,
				filename: attachment.filename,
				contentType: attachment.contentType,
				sizeBytes: attachment.sizeBytes,
			}),
			{ headers: { "Content-Type": "application/json" } },
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[attachments] Upload failed:", message, err);
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}

/**
 * Handle GET /api/attachments/:id — download an attachment.
 * Proxies the blob through the app (private container, managed identity).
 */
export async function handleAttachmentDownload(request: Request): Promise<Response> {
	try {
		const url = new URL(request.url);
		const match = url.pathname.match(/^\/api\/attachments\/([^/]+)$/);
		if (!match) return new Response("Not found", { status: 404 });

		const attachmentId = match[1];

		const attachment = await db.query.attachments.findFirst({
			where: eq(attachments.id, attachmentId),
		});
		if (!attachment) return new Response("Not found", { status: 404 });

		const blob = await downloadBlob("attachments", attachment.blobName);
		if (!blob) return new Response("File not found in storage", { status: 404 });

		return new Response(blob.data, {
			headers: {
				"Content-Type": blob.contentType,
				"Content-Disposition": `inline; filename="${attachment.filename}"`,
				"Cache-Control": "private, max-age=3600",
			},
		});
	} catch {
		return new Response("Download failed", { status: 500 });
	}
}
