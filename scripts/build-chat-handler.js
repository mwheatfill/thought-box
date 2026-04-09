// Build the chat handler as a separate ESM bundle for production
// This is needed because TanStack Start's vite build doesn't include custom API routes

const esbuild = await import(
	"../node_modules/.pnpm/esbuild@0.27.7/node_modules/esbuild/lib/main.js"
);

await esbuild.build({
	entryPoints: ["src/server/api/chat.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "dist/server/chat-handler.js",
	// Mark ALL node_modules as external — we don't want to bundle them,
	// they'll be available in node_modules at runtime
	packages: "external",
	alias: {
		"#/*": "./src/*",
	},
});

console.log("Chat handler built → dist/server/chat-handler.js");
