import { and, eq, isNull } from "drizzle-orm";
import { db } from "#/server/db";
import { attachments, ideaEvents, ideas } from "#/server/db/schema";
import { audit } from "#/server/lib/audit";
import { resolveAuthUser } from "#/server/lib/auth-from-request";
import { downloadBlob, getMaxFileSize, isAllowedType, uploadBlob } from "#/server/lib/blob";
import { trackEvent } from "#/server/lib/telemetry";

/**
 * Handle POST /api/attachments — upload a file to an idea.
 * Expects multipart/form-data with fields: file, ideaId, messageId (optional).
 * The uploader's identity is taken from the Easy Auth headers, not the form.
 */
export async function handleAttachmentUpload(request: Request): Promise<Response> {
	try {
		const user = await resolveAuthUser(request);
		if (!user) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}

		const formData = await request.formData();
		const file = formData.get("file") as File | null;
		const ideaId = formData.get("ideaId") as string | null;
		const messageId = (formData.get("messageId") as string) || null;

		if (!file || !ideaId) {
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

		// Verify the idea exists + the user has access to it
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, ideaId),
			columns: {
				id: true,
				submissionId: true,
				status: true,
				submitterId: true,
				assignedOwnerId: true,
			},
		});
		if (!idea) {
			return new Response(JSON.stringify({ error: "Idea not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}
		// Access & perspective by relationship to this idea, not global role —
		// an "owner"-role user who submitted this idea acts on it as its submitter.
		const isAssignedOwner = idea.assignedOwnerId === user.id;
		const viewerIsSubmitter = user.role !== "admin" && !isAssignedOwner;
		const ideaOK = user.role === "admin" || isAssignedOwner || idea.submitterId === user.id;
		if (!ideaOK) {
			return new Response(JSON.stringify({ error: "Forbidden" }), {
				status: 403,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Visibility rules:
		// - Thread-attached uploads (messageId set): inherit from the parent
		//   event type — internal_note → private, message → public.
		// - Direct uploads (no messageId): owner/admin → private by default
		//   (the Attachments tab is mostly internal context for them);
		//   submitter → public (their idea, their files).
		let isInternal = false;
		if (messageId) {
			const event = await db.query.ideaEvents.findFirst({
				where: eq(ideaEvents.id, messageId),
				columns: { eventType: true },
			});
			isInternal = event?.eventType === "internal_note";
			if (isInternal && viewerIsSubmitter) {
				return new Response(JSON.stringify({ error: "Forbidden" }), {
					status: 403,
					headers: { "Content-Type": "application/json" },
				});
			}
		} else {
			isInternal = !viewerIsSubmitter;
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

		// Check for duplicate filename on this idea
		const existing = await db.query.attachments.findFirst({
			where: and(
				eq(attachments.ideaId, ideaId),
				eq(attachments.filename, file.name),
				isNull(attachments.deletedAt),
			),
		});
		if (existing) {
			return new Response(
				JSON.stringify({
					error: `"${file.name}" already exists on this idea. Delete it first to re-upload.`,
				}),
				{ status: 409, headers: { "Content-Type": "application/json" } },
			);
		}

		// Generate blob name: ideas/{ideaId}/{timestamp}-{filename}
		const blobName = `ideas/${ideaId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

		// Upload to Blob Storage
		await uploadBlob("attachments", blobName, buffer, file.type);

		const [attachment] = await db
			.insert(attachments)
			.values({
				ideaId,
				messageId,
				filename: file.name,
				contentType: file.type,
				sizeBytes: file.size,
				blobName,
				uploadedById: user.id,
				// Store the derived flag for direct uploads. For thread uploads
				// the flag is also true when the parent is an internal_note,
				// which keeps the row-level filter consistent.
				isInternal,
			})
			.returning();

		// Log to activity timeline
		await db.insert(ideaEvents).values({
			ideaId,
			eventType: "attachment_added",
			actorId: user.id,
			note: file.name,
		});

		trackEvent(
			"FileUploaded",
			{ ideaId, contentType: file.type, filename: file.name },
			{ sizeBytes: file.size },
		);

		audit({
			actorId: user.id,
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
				uploadedBy: user.displayName,
				createdAt: attachment.createdAt.toISOString(),
				isInternal,
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

		const user = await resolveAuthUser(request);
		if (!user) return new Response("Unauthorized", { status: 401 });

		const attachmentId = match[1];

		const attachment = await db.query.attachments.findFirst({
			where: eq(attachments.id, attachmentId),
		});
		if (!attachment) return new Response("Not found", { status: 404 });

		// Idea-level access check: submitters can only download attachments on
		// their own ideas; owners only on ideas assigned to them; admins on any.
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, attachment.ideaId),
			columns: { submitterId: true, assignedOwnerId: true },
		});
		if (!idea) return new Response("Not found", { status: 404 });
		// Access & perspective by relationship to this idea, not global role —
		// an "owner"-role user who submitted this idea views it as its submitter.
		const isAssignedOwner = idea.assignedOwnerId === user.id;
		const viewerIsSubmitter = user.role !== "admin" && !isAssignedOwner;
		const ideaOK = user.role === "admin" || isAssignedOwner || idea.submitterId === user.id;
		if (!ideaOK) return new Response("Not found", { status: 404 });

		// Visibility check: internal attachments are owner/admin-only. A row
		// is internal if the column flag is set OR its parent event is an
		// internal_note. Both paths block submitter access here.
		if (viewerIsSubmitter) {
			let blocked = attachment.isInternal;
			if (!blocked && attachment.messageId) {
				const event = await db.query.ideaEvents.findFirst({
					where: eq(ideaEvents.id, attachment.messageId),
					columns: { eventType: true },
				});
				blocked = event?.eventType === "internal_note";
			}
			if (blocked) return new Response("Not found", { status: 404 });
		}

		const blob = await downloadBlob("attachments", attachment.blobName);
		if (!blob) return new Response("File not found in storage", { status: 404 });

		return new Response(blob.data as unknown as BodyInit, {
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

/**
 * Handle DELETE /api/attachments/:id — soft delete an attachment.
 */
export async function handleAttachmentDelete(request: Request): Promise<Response> {
	try {
		const url = new URL(request.url);
		const match = url.pathname.match(/^\/api\/attachments\/([^/]+)$/);
		if (!match) return new Response("Not found", { status: 404 });

		const user = await resolveAuthUser(request);
		if (!user) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}

		const attachmentId = match[1];

		const attachment = await db.query.attachments.findFirst({
			where: and(eq(attachments.id, attachmentId), isNull(attachments.deletedAt)),
		});
		if (!attachment) {
			return new Response("Not found", { status: 404 });
		}

		// Idea-level access check + role-based visibility on internal_note attachments
		const idea = await db.query.ideas.findFirst({
			where: eq(ideas.id, attachment.ideaId),
			columns: { submissionId: true, submitterId: true, assignedOwnerId: true },
		});
		if (!idea) return new Response("Not found", { status: 404 });
		// Access & perspective by relationship to this idea, not global role —
		// an "owner"-role user who submitted this idea acts on it as its submitter.
		const isAssignedOwner = idea.assignedOwnerId === user.id;
		const viewerIsSubmitter = user.role !== "admin" && !isAssignedOwner;
		const ideaOK = user.role === "admin" || isAssignedOwner || idea.submitterId === user.id;
		if (!ideaOK) return new Response("Not found", { status: 404 });

		if (viewerIsSubmitter) {
			let blocked = attachment.isInternal;
			if (!blocked && attachment.messageId) {
				const event = await db.query.ideaEvents.findFirst({
					where: eq(ideaEvents.id, attachment.messageId),
					columns: { eventType: true },
				});
				blocked = event?.eventType === "internal_note";
			}
			if (blocked) return new Response("Not found", { status: 404 });
		}

		// Soft delete
		await db
			.update(attachments)
			.set({ deletedAt: new Date(), deletedById: user.id })
			.where(eq(attachments.id, attachmentId));

		// Log to activity timeline
		await db.insert(ideaEvents).values({
			ideaId: attachment.ideaId,
			eventType: "attachment_deleted",
			actorId: user.id,
			note: attachment.filename,
		});

		audit({
			actorId: user.id,
			action: "attachment.deleted",
			resourceType: "attachment",
			resourceId: idea.submissionId ?? attachment.ideaId,
			details: { filename: attachment.filename },
		});

		return new Response(JSON.stringify({ success: true }), {
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}
