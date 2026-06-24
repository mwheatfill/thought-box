import { createServerFn } from "@tanstack/react-start";
import { ensureDevPersonas, isDevEnv } from "#/server/lib/dev-personas";

/**
 * List the dev personas for the persona switcher, ensuring they exist with the
 * right relationships. Dev-only — returns [] in any non-dev environment (and the
 * switcher UI is itself compiled out of production via `import.meta.env.DEV`).
 */
export const getDevPersonas = createServerFn().handler(async () => {
	if (!isDevEnv()) return [];
	return ensureDevPersonas();
});
