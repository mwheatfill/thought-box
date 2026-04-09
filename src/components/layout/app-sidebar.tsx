import { Link, useRouter } from "@tanstack/react-router";
import {
	LayoutDashboard,
	Lightbulb,
	type LucideIcon,
	Settings,
	Shield,
	Tags,
	Users,
} from "lucide-react";
import { ThemeToggle } from "#/components/layout/theme-toggle";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Separator } from "#/components/ui/separator";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "#/components/ui/sidebar";
import type { AuthUser } from "#/server/middleware/auth";

// ── Nav items ──────────────────────────────────────────────────────────────

interface NavItem {
	label: string;
	href: string;
	icon: LucideIcon;
}

const mainNav: NavItem[] = [
	{ label: "Submit", href: "/", icon: Lightbulb },
	{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
];

const adminNav: NavItem[] = [
	{ label: "Categories", href: "/admin/categories", icon: Tags },
	{ label: "Users", href: "/admin/users", icon: Users },
	{ label: "Settings", href: "/admin/settings", icon: Settings },
];

// ── Initials helper ────────────────────────────────────────────────────────

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((part) => part[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

// ── Sidebar ────────────────────────────────────────────────────────────────

interface AppSidebarProps {
	user: AuthUser;
}

export function AppSidebar({ user }: AppSidebarProps) {
	const router = useRouter();
	const isAdmin = user.role === "admin";
	const currentPath = router.state.location.pathname;

	return (
		<Sidebar>
			<SidebarHeader className="p-4">
				<div className="flex items-center justify-between">
					<Link to="/" className="flex items-center gap-2 font-semibold">
						<Lightbulb className="size-5 text-primary" />
						<span className="text-lg">ThoughtBox</span>
					</Link>
					<ThemeToggle />
				</div>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{mainNav.map((item) => (
								<SidebarMenuItem key={item.href}>
									<SidebarMenuButton
										asChild
										isActive={
											item.href === "/" ? currentPath === "/" : currentPath.startsWith(item.href)
										}
									>
										<Link to={item.href}>
											<item.icon className="size-4" />
											<span>{item.label}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				{isAdmin && (
					<>
						<Separator className="mx-4" />
						<SidebarGroup>
							<SidebarGroupLabel>
								<Shield className="mr-2 size-3" />
								Admin
							</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu>
									{adminNav.map((item) => (
										<SidebarMenuItem key={item.href}>
											<SidebarMenuButton asChild isActive={currentPath.startsWith(item.href)}>
												<Link to={item.href}>
													<item.icon className="size-4" />
													<span>{item.label}</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									))}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					</>
				)}
			</SidebarContent>

			<SidebarFooter className="p-4">
				<div className="flex items-center gap-3">
					<Avatar className="size-8">
						<AvatarFallback className="text-xs">{getInitials(user.displayName)}</AvatarFallback>
					</Avatar>
					<div className="flex flex-col">
						<span className="text-sm font-medium leading-none">{user.displayName}</span>
						<span className="text-xs text-muted-foreground capitalize">{user.role}</span>
					</div>
				</div>
			</SidebarFooter>

			<SidebarRail />
		</Sidebar>
	);
}
