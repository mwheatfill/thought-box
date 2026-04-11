import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { handleAttachmentDownload, handleAttachmentUpload } from "#/server/api/attachments";
import { handleChatRequest } from "#/server/api/chat";
import { handlePhotoRequest } from "#/server/api/photo";

const startHandler = createStartHandler(defaultStreamHandler);

// In production, server-adapter.js intercepts custom API routes before they reach here.
// This routing is only active in dev mode (vite dev).
export default {
	async fetch(request: Request, opts?: unknown): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/api/chat" && request.method === "POST") {
			return handleChatRequest(request);
		}

		if (url.pathname.startsWith("/api/users/") && url.pathname.endsWith("/photo")) {
			return handlePhotoRequest(request);
		}

		if (url.pathname === "/api/attachments" && request.method === "POST") {
			return handleAttachmentUpload(request);
		}

		if (url.pathname.match(/^\/api\/attachments\/[^/]+$/) && request.method === "GET") {
			return handleAttachmentDownload(request);
		}

		return startHandler(request, opts);
	},
};
