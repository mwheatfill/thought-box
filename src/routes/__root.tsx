import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	HeadContent,
	Outlet,
	Scripts,
	createRootRoute,
	redirect,
	useLocation,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { AppSidebar } from "#/components/layout/app-sidebar";
import { Button } from "#/components/ui/button";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "#/components/ui/sidebar";
import { Toaster } from "#/components/ui/sonner";
import { TooltipProvider } from "#/components/ui/tooltip";
import { getCurrentUser } from "#/server/functions/users";

import type { AuthUser } from "#/server/middleware/auth";
import appCss from "../styles/globals.css?url";

let cachedUser: AuthUser | null = null;

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);root.style.colorScheme=resolved;}catch(e){}})();`;

// Clarity snippet — replace YOUR_CLARITY_ID with your project ID from clarity.microsoft.com
const CLARITY_SCRIPT = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","w9sdqqjw4a");`;

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "ThoughtBox" },
			{
				name: "description",
				content: "Share an idea to make things better for our team and our members.",
			},
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	beforeLoad: async ({ location }) => {
		// Skip auth for the deactivated page to avoid redirect loops
		if (location.pathname === "/deactivated") {
			return { user: null as unknown as AuthUser };
		}

		// Cache user on client after first load — only changes on login/logout (full reload)
		if (typeof window !== "undefined" && cachedUser) {
			return { user: cachedUser };
		}
		try {
			const user = await getCurrentUser();
			if (typeof window !== "undefined") {
				cachedUser = user;
			}
			return { user };
		} catch (err) {
			const msg = err instanceof Error ? err.message : "";

			// Deactivated user — redirect to a clear explanation page
			if (msg.includes("Account deactivated")) {
				throw redirect({ to: "/deactivated" });
			}

			// Auth expired — force full reload so Easy Auth redirects to login
			if (typeof window !== "undefined") {
				if (msg.includes("Unauthorized") || msg.includes("401")) {
					window.location.reload();
					// Return never-resolving promise to prevent flash
					return new Promise(() => {}) as never;
				}
			}
			throw err;
		}
	},
	component: RootComponent,
	errorComponent: RootErrorComponent,
	shellComponent: RootDocument,
});

function RootErrorComponent({ error }: { error: Error }) {
	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
			<div className="mb-4 rounded-full bg-muted p-4">
				<AlertTriangle className="size-8 text-muted-foreground" />
			</div>
			<h2 className="mb-2 text-xl font-semibold">Something went wrong</h2>
			<p className="mb-6 max-w-md text-sm text-muted-foreground">
				An unexpected error occurred. This is usually temporary — try refreshing the page.
			</p>
			<Button variant="outline" onClick={() => window.location.reload()}>
				<RefreshCw className="mr-2 size-4" />
				Refresh Page
			</Button>
			{process.env.NODE_ENV === "development" && (
				<pre className="mt-6 max-w-lg overflow-auto rounded-md bg-muted p-3 text-left text-xs">
					{error.message}
				</pre>
			)}
		</div>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme init script prevents FOUC */}
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Clarity analytics snippet */}
				<script dangerouslySetInnerHTML={{ __html: CLARITY_SCRIPT }} />
				<HeadContent />
			</head>
			<body className="font-sans antialiased">
				{children}
				<Scripts />
			</body>
		</html>
	);
}

function RootComponent() {
	const { user } = Route.useRouteContext();
	const [queryClient] = useState(() => new QueryClient());
	const pathname = useLocation().pathname;
	const isLandingPage = pathname === "/";
	const isDeactivatedPage = pathname === "/deactivated";

	// Deactivated page renders without sidebar/header chrome
	if (isDeactivatedPage) {
		return (
			<QueryClientProvider client={queryClient}>
				<TooltipProvider>
					<Outlet />
					<Toaster position="bottom-right" richColors />
				</TooltipProvider>
			</QueryClientProvider>
		);
	}

	return (
		<QueryClientProvider client={queryClient}>
			<TooltipProvider>
				<SidebarProvider defaultOpen={false} persistState={!isLandingPage}>
					<AppSidebar user={user} />
					<SidebarInset>
						<header
							className={`sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 px-4 ${isLandingPage ? "bg-transparent" : "bg-background/80 backdrop-blur-sm"}`}
						>
							<SidebarTrigger className="text-foreground" />
							<span className="text-base font-semibold text-foreground">ThoughtBox</span>
						</header>
						<Outlet />
					</SidebarInset>
				</SidebarProvider>
				<Toaster position="bottom-right" richColors />
				<TanStackDevtools
					config={{ position: "bottom-right" }}
					plugins={[
						{
							name: "TanStack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
			</TooltipProvider>
		</QueryClientProvider>
	);
}
