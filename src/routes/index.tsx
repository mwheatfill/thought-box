import { Link, createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard, Lightbulb, Moon, Settings, Sun, Tags, Users } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { ChatInterface } from "#/components/chat/chat-interface";
import { FadeIn } from "#/components/ui/animated";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { getLandingData } from "#/server/functions/landing";

export const Route = createFileRoute("/")({
	loader: () => getLandingData(),
	component: LandingPage,
});

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((part) => part[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

function LandingPage() {
	const { user } = Route.useRouteContext();
	const { yearlyCount, monthlyCount, suggestedPrompts, showSocialProof } = Route.useLoaderData();
	const [hasStarted, setHasStarted] = useState(false);
	const isAdmin = user.role === "admin";

	return (
		<main className="relative flex min-h-screen flex-col">
			{/* Corner nav */}
			<div className="absolute right-4 top-4 z-10 flex items-center gap-2">
				<ThemeToggle />
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="gap-2 px-2">
							<Avatar className="size-7">
								<AvatarFallback className="text-xs">{getInitials(user.displayName)}</AvatarFallback>
							</Avatar>
							<span className="hidden text-sm sm:inline">{user.displayName}</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-48">
						<DropdownMenuItem asChild>
							<Link to="/dashboard">
								<LayoutDashboard className="mr-2 size-4" />
								Dashboard
							</Link>
						</DropdownMenuItem>
						{isAdmin && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem asChild>
									<Link to="/admin/categories">
										<Tags className="mr-2 size-4" />
										Categories
									</Link>
								</DropdownMenuItem>
								<DropdownMenuItem asChild>
									<Link to="/admin/users">
										<Users className="mr-2 size-4" />
										Users
									</Link>
								</DropdownMenuItem>
								<DropdownMenuItem asChild>
									<Link to="/admin/settings">
										<Settings className="mr-2 size-4" />
										Settings
									</Link>
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Centered hero + compact input (initial state) */}
			<motion.div
				className="flex flex-1 flex-col items-center justify-center px-4"
				animate={{
					paddingTop: hasStarted ? "2rem" : "0",
					justifyContent: hasStarted ? "flex-start" : "center",
				}}
				transition={{ duration: 0.4, ease: "easeInOut" }}
			>
				{/* Hero content — shrinks when chat starts */}
				<motion.div
					className="flex flex-col items-center text-center"
					animate={{
						scale: hasStarted ? 0.8 : 1,
						opacity: hasStarted ? 0.7 : 1,
						marginBottom: hasStarted ? "0.5rem" : "2rem",
					}}
					transition={{ duration: 0.4, ease: "easeInOut" }}
				>
					<FadeIn>
						<div className="mb-3 flex justify-center">
							<div className="rounded-full bg-primary/10 p-3">
								<Lightbulb className="size-8 text-primary" />
							</div>
						</div>
					</FadeIn>

					{yearlyCount > 0 && (
						<FadeIn delay={0.1}>
							<p className="mb-1 text-2xl font-bold tracking-tight">
								{yearlyCount} {yearlyCount === 1 ? "idea" : "ideas"} shared in{" "}
								{new Date().getFullYear()}
							</p>
						</FadeIn>
					)}

					<FadeIn delay={0.15}>
						<p className="max-w-md text-sm text-muted-foreground">
							Share an idea to make things better for our team and our members.
						</p>
					</FadeIn>

					{showSocialProof && monthlyCount > 0 && !hasStarted && (
						<FadeIn delay={0.2}>
							<p className="mt-1 text-xs text-muted-foreground">
								{monthlyCount} {monthlyCount === 1 ? "idea" : "ideas"} shared this month
							</p>
						</FadeIn>
					)}
				</motion.div>

				{/* Chat container — starts compact, expands */}
				<motion.div
					className="w-full overflow-hidden rounded-xl border bg-card shadow-sm"
					animate={{
						maxWidth: hasStarted ? "42rem" : "32rem",
						height: hasStarted ? "calc(100vh - 12rem)" : "auto",
						minHeight: hasStarted ? "400px" : "0",
					}}
					transition={{ duration: 0.4, ease: "easeInOut" }}
				>
					<ChatInterface
						user={user}
						suggestedPrompts={suggestedPrompts}
						onFirstMessage={() => setHasStarted(true)}
					/>
				</motion.div>
			</motion.div>
		</main>
	);
}

function ThemeToggle() {
	const [theme, setTheme] = useState<"light" | "dark">("light");

	useEffect(() => {
		const root = document.documentElement;
		const isDark = root.classList.contains("dark");
		setTheme(isDark ? "dark" : "light");
	}, []);

	function toggle() {
		const next = theme === "light" ? "dark" : "light";
		setTheme(next);
		const root = document.documentElement;
		root.classList.remove("light", "dark");
		root.classList.add(next);
		root.style.colorScheme = next;
		localStorage.setItem("theme", next);
	}

	return (
		<Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
			{theme === "light" ? <Sun className="size-4" /> : <Moon className="size-4" />}
		</Button>
	);
}
