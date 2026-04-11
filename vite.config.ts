import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const config = defineConfig({
	plugins: [
		devtools(),
		tsconfigPaths({ projects: ["./tsconfig.json"] }),
		tailwindcss(),
		tanstackStart({
			server: {
				entry: "./src/entry.server.ts",
			},
		}),
		viteReact(),
		// Custom API middleware plugin for /api/chat
		{
			name: "api-chat-middleware",
			configureServer(server) {
				server.middlewares.use("/api/chat", async (req, res) => {
					if (req.method !== "POST") {
						res.statusCode = 405;
						res.end("Method Not Allowed");
						return;
					}

					try {
						// Collect the request body
						const chunks: Buffer[] = [];
						for await (const chunk of req) {
							chunks.push(chunk as Buffer);
						}
						const body = Buffer.concat(chunks).toString();

						// Create a proper Request object
						const request = new Request(`http://localhost${req.url}`, {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body,
						});

						// Dynamic import to get fresh module in dev
						const { handleChatRequest } = await import("./src/server/api/chat.ts");
						const response = await handleChatRequest(request);

						// Stream the response back
						res.statusCode = response.status;
						response.headers.forEach((value, key) => {
							res.setHeader(key, value);
						});

						if (response.body) {
							const reader = response.body.getReader();
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
							res.end(await response.text());
						}
					} catch (error) {
						console.error("Chat API error:", error);
						res.statusCode = 500;
						res.end(JSON.stringify({ error: "Internal server error" }));
					}
				});
			},
		},
		// Attachment upload/download middleware for dev
		{
			name: "api-attachments-middleware",
			configureServer(server) {
				server.middlewares.use("/api/attachments", async (req, res) => {
					try {
						const chunks: Buffer[] = [];
						for await (const chunk of req) {
							chunks.push(chunk as Buffer);
						}
						const body = Buffer.concat(chunks);

						const headers = new Headers();
						for (const [key, value] of Object.entries(req.headers)) {
							if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
						}

						const request = new Request(`http://localhost${req.url}`, {
							method: req.method,
							headers,
							body: req.method === "GET" ? undefined : body,
							// @ts-expect-error duplex needed for Node
							duplex: "half",
						});

						const mod = await import("./src/server/api/attachments.ts");
						const response =
							req.method === "POST"
								? await mod.handleAttachmentUpload(request)
								: await mod.handleAttachmentDownload(request);

						res.statusCode = response.status;
						response.headers.forEach((value: string, key: string) => {
							res.setHeader(key, value);
						});

						const responseBody = await response.arrayBuffer();
						res.end(Buffer.from(responseBody));
					} catch (error) {
						console.error("Attachment API error:", error);
						res.statusCode = 500;
						res.end(JSON.stringify({ error: "Internal server error" }));
					}
				});
			},
		},
	],
});

export default config;
