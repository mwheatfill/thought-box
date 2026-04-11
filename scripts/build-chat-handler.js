// Build the chat handler as a separate ESM bundle for production.
// TanStack Start's vite build doesn't include custom API routes.

const esbuild = await import("esbuild");

await esbuild.build({
	entryPoints: ["src/server/api/chat.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "dist/server/chat-handler.js",
	packages: "external",
	alias: {
		"#/*": "./src/*",
	},
});

console.log("Chat handler built → dist/server/chat-handler.js");

await esbuild.build({
	entryPoints: ["src/server/api/photo.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "dist/server/photo-handler.js",
	packages: "external",
	alias: {
		"#/*": "./src/*",
	},
});

console.log("Photo handler built → dist/server/photo-handler.js");

await esbuild.build({
	entryPoints: ["src/server/api/sla-cron.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "dist/server/sla-cron.js",
	packages: "external",
	alias: {
		"#/*": "./src/*",
	},
});

console.log("SLA cron handler built → dist/server/sla-cron.js");

await esbuild.build({
	entryPoints: ["src/server/api/health.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "dist/server/health.js",
	packages: "external",
	alias: {
		"#/*": "./src/*",
	},
});

console.log("Health handler built → dist/server/health.js");

await esbuild.build({
	entryPoints: ["src/server/api/attachments.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "dist/server/attachments.js",
	packages: "external",
	alias: {
		"#/*": "./src/*",
	},
});

console.log("Attachments handler built → dist/server/attachments.js");
