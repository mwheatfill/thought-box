/**
 * Runtime deployment flags, read straight from `process.env` with NO validation
 * (so importing this in the hot auth path can never throw) and NO heavy imports.
 *
 * We alias `process.env` to a local first: Vite statically replaces textual
 * `process.env.X` member access at build time, but a bare `process.env` (and
 * member access off an alias) stays a real runtime read — the same trick
 * `env.ts` relies on with `safeParse(process.env)`.
 */
const runtimeEnv = process.env as Record<string, string | undefined>;

/**
 * Whether admin-gated persona impersonation may run in this DEPLOYED environment.
 * Requires `APP_ENV=dev` AND a non-prod shared mailbox — so a single misconfigured
 * `APP_ENV` in production still can't enable impersonation while the prod mailbox
 * is set (defense-in-depth). A missing `APP_ENV` is treated as prod (fail-safe).
 * Local development uses the NODE_ENV-based `isDevEnv()` path instead.
 */
export const personasEnabled =
	runtimeEnv.APP_ENV === "dev" &&
	runtimeEnv.THOUGHTBOX_SHARED_MAILBOX !== "thoughtbox@desertfinancial.com";
