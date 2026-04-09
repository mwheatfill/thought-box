import { TanStackDevtools } from "@tanstack/react-devtools";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useState } from "react";
import { AppSidebar } from "#/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "#/components/ui/sidebar";
import { Toaster } from "#/components/ui/sonner";
import { TooltipProvider } from "#/components/ui/tooltip";
import { getCurrentUser } from "#/server/functions/users";

import appCss from "../styles/globals.css?url";

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);root.style.colorScheme=resolved;}catch(e){}})();`;

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
	beforeLoad: async () => {
		const user = await getCurrentUser();
		return { user };
	},
	component: RootComponent,
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme init script prevents FOUC */}
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
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

	return (
		<QueryClientProvider client={queryClient}>
			<TooltipProvider>
				<SidebarProvider>
					<AppSidebar user={user} />
					<SidebarInset>
						<header className="flex h-12 items-center gap-2 border-b px-4">
							<SidebarTrigger />
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
