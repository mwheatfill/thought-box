import { createMiddleware, createServerFn } from "@tanstack/react-start";

// Mirrors SIDEBAR_COOKIE_NAME in components/ui/sidebar.tsx — the cookie's wire
// name. Kept as a literal here so server code doesn't import a UI module.
const SIDEBAR_COOKIE_NAME = "sidebar_state";

/**
 * Reads the persisted sidebar open/closed preference from the request cookie so
 * the server can render the sidebar in its final state. Without this the cookie
 * was only read client-side post-hydration, causing an open→closed flash for
 * users who had collapsed it. Returns null when no preference is stored.
 */
const sidebarCookieMiddleware = createMiddleware().server(async ({ next, request }) => {
	const cookie = request.headers.get("cookie") ?? "";
	const match = cookie.match(new RegExp(`(?:^|; )${SIDEBAR_COOKIE_NAME}=([^;]*)`));
	return next({ context: { sidebarOpen: match ? match[1] === "true" : null } });
});

export const getSidebarState = createServerFn()
	.middleware([sidebarCookieMiddleware])
	.handler(async ({ context }) => context.sidebarOpen);
