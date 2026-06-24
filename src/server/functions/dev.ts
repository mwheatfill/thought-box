import { createServerFn } from "@tanstack/react-start";
import { ensureDevPersonas, personaSwitchingEnabled } from "#/server/lib/dev-personas";

/**
 * List the dev personas for the persona switcher, ensuring they exist with the
 * right relationships. Returns [] unless persona switching is enabled (local dev
 * or a deployed dev env); the actual identity override is admin-gated elsewhere.
 */
export const getDevPersonas = createServerFn().handler(async () => {
	if (!personaSwitchingEnabled()) return [];
	return ensureDevPersonas();
});
