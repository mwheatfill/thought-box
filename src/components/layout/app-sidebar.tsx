import { Link, useRouter } from "@tanstack/react-router";
import {
	BarChart3,
	ClipboardList,
	FileText,
	Inbox,
	LayoutDashboard,
	Lightbulb,
	type LucideIcon,
	Settings,
	Shield,
	Tags,
	Trash2,
	Users,
} from "lucide-react";
import { ThemeToggle } from "#/components/layout/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Separator } from "#/components/ui/separator";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
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

function getMainNav(role: string): NavItem[] {
	const items: NavItem[] = [{ label: "Submit", href: "/", icon: Lightbulb }];

	if (role === "admin") {
		items.push({ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard });
		items.push({ label: "All Ideas", href: "/admin/ideas", icon: FileText });
		items.push({ label: "My Queue", href: "/queue", icon: Inbox });
		items.push({ label: "My Ideas", href: "/my-ideas", icon: Lightbulb });
	} else if (role === "leader") {
		items.push({ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard });
		items.push({ label: "My Queue", href: "/queue", icon: Inbox });
	} else {
		items.push({ label: "My Ideas", href: "/my-ideas", icon: Lightbulb });
	}

	return items;
}

const adminNav: NavItem[] = [
	{ label: "Categories", href: "/admin/categories", icon: Tags },
	{ label: "Users", href: "/admin/users", icon: Users },
	{ label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
	{ label: "Audit Log", href: "/admin/audit", icon: ClipboardList },
	{ label: "Recycle Bin", href: "/admin/recycle-bin", icon: Trash2 },
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
	const mainNav = getMainNav(user.role);

	return (
		<Sidebar>
			<SidebarContent className="pt-2">
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{mainNav.map((item) => (
								<SidebarMenuItem key={item.href}>
									<SidebarMenuButton
										asChild
										isActive={
											item.href === "/"
												? currentPath === "/"
												: currentPath === item.href || currentPath.startsWith(`${item.href}/`)
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
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<Avatar className="size-8">
							{user.photoUrl && <AvatarImage src={user.photoUrl} alt={user.displayName} />}
							<AvatarFallback className="text-xs">{getInitials(user.displayName)}</AvatarFallback>
						</Avatar>
						<div className="flex flex-col">
							<span className="text-sm font-medium leading-none">{user.displayName}</span>
							<span className="text-xs text-muted-foreground capitalize">{user.role}</span>
						</div>
					</div>
					<ThemeToggle />
				</div>
			</SidebarFooter>

			<SidebarRail />
		</Sidebar>
	);
}
