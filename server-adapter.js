import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import appInsights from "applicationinsights";

// Initialize App Insights before importing app code
const aiConnStr = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
if (aiConnStr) {
	appInsights
		.setup(aiConnStr)
		.setAutoCollectRequests(true)
		.setAutoCollectExceptions(true)
		.setAutoCollectDependencies(true)
		.setAutoCollectPerformance(true, true)
		.start();
	console.log("[app-insights] Initialized");
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const serverModule = await import("./dist/server/server.js");
const { fetch: fetchHandler } = serverModule.default;
const { handleChatRequest } = await import("./dist/server/chat-handler.js");
const { handlePhotoRequest } = await import("./dist/server/photo-handler.js");
const { handleSlaCronRequest } = await import("./dist/server/sla-cron.js");
const { handleHealthRequest } = await import("./dist/server/health.js");
const { init: initEmailLog } = await import("./dist/server/init-email-log.js");
initEmailLog();

const { handleAttachmentUpload, handleAttachmentDownload, handleAttachmentDelete } = await import(
	"./dist/server/attachments.js"
);

const PORT = process.env.PORT || 3000;
const CLIENT_DIR = join(__dirname, "dist", "client");

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

async function tryServeStaticFile(req, res) {
	try {
		const url = new URL(req.url, `http://${req.headers.host}`);
		const pathname = url.pathname;

		const ext = extname(pathname);
		if (!ext || !MIME_TYPES[ext]) return false;
		if (pathname.includes("..")) return false;

		const filePath = join(CLIENT_DIR, pathname);
		const fileStat = await stat(filePath);

		if (!fileStat.isFile()) return false;

		const mimeType = MIME_TYPES[ext];

		res.statusCode = 200;
		res.setHeader("Content-Type", mimeType);
		res.setHeader("Content-Length", fileStat.size);
		if (pathname.startsWith("/assets/")) {
			res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
		}

		createReadStream(filePath).pipe(res);
		return true;
	} catch {
		return false;
	}
}

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

async function sendWebResponse(webResponse, res) {
	res.statusCode = webResponse.status;
	webResponse.headers.forEach((value, key) => res.setHeader(key, value));

	if (webResponse.body) {
		const reader = webResponse.body.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			res.write(value);
		}
	}
	res.end();
}

const server = createServer(async (req, res) => {
	try {
		if (await tryServeStaticFile(req, res)) return;

		// Health check — lightweight DB ping, no auth required
		if (req.url === "/health") {
			await sendWebResponse(await handleHealthRequest(), res);
			return;
		}

		const webRequest = toWebRequest(req);

		// Chat API uses a separately-built handler (TanStack Start doesn't bundle custom API routes)
		if (req.url === "/api/chat" && req.method === "POST") {
			await sendWebResponse(await handleChatRequest(webRequest), res);
			return;
		}

		// Photo endpoint (separately built, same as chat handler)
		if (req.url.match(/^\/api\/users\/[^/]+\/photo$/)) {
			await sendWebResponse(await handlePhotoRequest(webRequest), res);
			return;
		}

		// Attachment upload
		if (req.url === "/api/attachments" && req.method === "POST") {
			await sendWebResponse(await handleAttachmentUpload(webRequest), res);
			return;
		}

		// Attachment download
		if (req.url.match(/^\/api\/attachments\/[^/]+$/) && req.method === "GET") {
			await sendWebResponse(await handleAttachmentDownload(webRequest), res);
			return;
		}

		// Attachment delete
		if (req.url.match(/^\/api\/attachments\/[^/]+$/) && req.method === "DELETE") {
			await sendWebResponse(await handleAttachmentDelete(webRequest), res);
			return;
		}

		// Everything else: SSR, server functions, API routes
		await sendWebResponse(await fetchHandler(webRequest), res);
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

	// SLA reminder check — runs every hour, executes at 8am Phoenix time (MST/UTC-7)
	const SLA_CHECK_HOUR = 8;
	let lastSlaCheckDate = "";

	setInterval(async () => {
		const now = new Date();
		// Phoenix is UTC-7 (no daylight saving)
		const phoenixHour = (now.getUTCHours() - 7 + 24) % 24;
		const today = now.toISOString().slice(0, 10);

		if (phoenixHour === SLA_CHECK_HOUR && lastSlaCheckDate !== today) {
			lastSlaCheckDate = today;
			console.log("[sla-cron] Running daily SLA check...");
			try {
				await handleSlaCronRequest();
			} catch (err) {
				console.error("[sla-cron] Failed:", err);
			}
		}
	}, 60_000); // Check every minute
});

process.on("SIGTERM", () => {
	console.log("SIGTERM received, shutting down...");
	server.close(() => console.log("Server closed"));
});
