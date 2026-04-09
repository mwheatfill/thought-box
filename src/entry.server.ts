import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { handleChatRequest } from "#/server/api/chat";

const startHandler = createStartHandler(defaultStreamHandler);

// In production, server-adapter.js intercepts /api/chat before it reaches here.
// This routing is only active in dev mode (vite dev).
export default {
	async fetch(request: Request, opts?: unknown): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/api/chat" && request.method === "POST") {
			return handleChatRequest(request);
		}

		return startHandler(request, opts);
	},
};
