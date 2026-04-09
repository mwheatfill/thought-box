import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { handleChatRequest } from "#/server/api/chat";

const startHandler = createStartHandler(defaultStreamHandler);

export default {
	async fetch(request: Request, opts?: unknown): Promise<Response> {
		const url = new URL(request.url);

		// Custom API routes
		if (url.pathname === "/api/chat" && request.method === "POST") {
			return handleChatRequest(request);
		}

		// Everything else goes through TanStack Start
		return startHandler(request, opts);
	},
};
