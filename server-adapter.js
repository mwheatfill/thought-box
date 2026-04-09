import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the TanStack Start server entry
const serverModule = await import("./dist/server/server.js");
const { fetch: fetchHandler } = serverModule.default;

// Import the chat handler (built separately by esbuild)
const { handleChatRequest } = await import("./dist/server/chat-handler.js");

const PORT = process.env.PORT || 3000;
const CLIENT_DIR = join(__dirname, "dist", "client");

// MIME types for static file serving
const MIME_TYPES = {
	".html": "text/html",
	".js": "application/javascript",
	".css": "text/css",
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".eot": "application/vnd.ms-fontobject",
	".otf": "font/otf",
	".txt": "text/plain",
	".map": "application/json",
};

// Serve static files from dist/client/
async function tryServeStaticFile(req, res) {
	try {
		const url = new URL(req.url, `http://${req.headers.host}`);
		const pathname = url.pathname;

		if (pathname.includes("..")) return false;

		const filePath = join(CLIENT_DIR, pathname);
		const fileStat = await stat(filePath);

		if (!fileStat.isFile()) return false;

		const ext = pathname.substring(pathname.lastIndexOf("."));
		const mimeType = MIME_TYPES[ext] || "application/octet-stream";

		res.statusCode = 200;
		res.setHeader("Content-Type", mimeType);
		res.setHeader("Content-Length", fileStat.size);
		// Hashed filenames get aggressive caching
		if (pathname.startsWith("/assets/")) {
			res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
		}

		createReadStream(filePath).pipe(res);
		return true;
	} catch {
		return false;
	}
}

// Convert Node.js request to Web Standard Request
function toWebRequest(req) {
	const protocol = req.headers["x-forwarded-proto"] || "http";
	const host = req.headers.host;
	const url = `${protocol}://${host}${req.url}`;

	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value) {
			headers.append(key, Array.isArray(value) ? value.join(", ") : value);
		}
	}

	const init = { method: req.method, headers };

	if (req.method !== "GET" && req.method !== "HEAD") {
		init.body = req;
		init.duplex = "half";
	}

	return new Request(url, init);
}

// Create HTTP server
const server = createServer(async (req, res) => {
	try {
		// Static files first (fast path)
		if (await tryServeStaticFile(req, res)) return;

		// Chat API route (streaming)
		if (req.url === "/api/chat" && req.method === "POST") {
			const webRequest = toWebRequest(req);
			const webResponse = await handleChatRequest(webRequest);
			res.statusCode = webResponse.status;
			webResponse.headers.forEach((value, key) => res.setHeader(key, value));
			if (webResponse.body) {
				const reader = webResponse.body.getReader();
				const pump = async () => {
					const { done, value } = await reader.read();
					if (done) {
						res.end();
						return;
					}
					res.write(value);
					await pump();
				};
				await pump();
			} else {
				res.end();
			}
			return;
		}

		// Everything else goes through TanStack Start (SSR, server functions, API routes)
		const webRequest = toWebRequest(req);
		const webResponse = await fetchHandler(webRequest);

		res.statusCode = webResponse.status;
		webResponse.headers.forEach((value, key) => res.setHeader(key, value));

		if (webResponse.body) {
			const reader = webResponse.body.getReader();
			const pump = async () => {
				const { done, value } = await reader.read();
				if (done) {
					res.end();
					return;
				}
				res.write(value);
				await pump();
			};
			await pump();
		} else {
			res.end();
		}
	} catch (error) {
		console.error("Server error:", error);
		if (!res.headersSent) {
			res.statusCode = 500;
			res.setHeader("Content-Type", "text/plain");
			res.end("Internal Server Error");
		}
	}
});

server.listen(PORT, () => {
	console.log(`ThoughtBox running on http://localhost:${PORT}`);
	console.log(`Static files: ${CLIENT_DIR}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
	console.log("SIGTERM received, shutting down...");
	server.close(() => console.log("Server closed"));
});
