import { Link, createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard, Lightbulb, Settings, Tags, Users } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { ChatInterface } from "#/components/chat/chat-interface";
import { ThemeToggle } from "#/components/layout/theme-toggle";
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

function getGreeting(): string {
	const hour = new Date().getHours();
	if (hour < 12) return "Good morning";
	if (hour < 17) return "Good afternoon";
	return "Good evening";
}

function LandingPage() {
	const { user } = Route.useRouteContext();
	const { yearlyCount, suggestedPrompts } = Route.useLoaderData();
	const [hasStarted, setHasStarted] = useState(false);
	const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
	const isAdmin = user.role === "admin";
	const firstName = user.displayName.split(" ")[0];

	return (
		<main className="relative flex min-h-screen flex-col bg-gradient-to-b from-blue-100/60 via-indigo-50/30 to-background dark:from-blue-950/40 dark:via-indigo-950/20 dark:to-background">
			{/* Top bar — always visible */}
			<header className="flex shrink-0 items-center justify-between px-6 py-4">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<Lightbulb className="size-5 text-primary" />
					ThoughtBox
				</div>
				<div className="flex items-center gap-2">
					<ThemeToggle />
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" className="gap-2 px-2">
								<Avatar className="size-7">
									<AvatarFallback className="text-xs">
										{getInitials(user.displayName)}
									</AvatarFallback>
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
			</header>

			{/* Main content */}
			<div className="flex flex-1 flex-col items-center justify-center px-4">
				{/* Hero — greeting + prompts (hides when chat starts) */}
				<motion.div
					className="flex w-full max-w-2xl flex-col items-center"
					animate={{
						opacity: hasStarted ? 0 : 1,
						scale: hasStarted ? 0.95 : 1,
						height: hasStarted ? 0 : "auto",
						marginBottom: hasStarted ? 0 : "2rem",
					}}
					transition={{ duration: 0.4, ease: "easeInOut" }}
					style={{ overflow: "hidden", pointerEvents: hasStarted ? "none" : "auto" }}
				>
					{/* Icon */}
					<motion.div
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.4, delay: 0.05 }}
						className="mb-6"
					>
						<div className="rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 p-4">
							<Lightbulb className="size-10 text-primary" />
						</div>
					</motion.div>

					{/* Greeting */}
					<motion.div
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.4, delay: 0.1 }}
						className="mb-2 text-center"
					>
						<h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
							{getGreeting()}, {firstName}
						</h1>
						<p className="mt-2 text-lg text-muted-foreground">What idea can we capture today?</p>
					</motion.div>

					{/* Stats */}
					{yearlyCount > 0 && (
						<motion.p
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ duration: 0.4, delay: 0.2 }}
							className="mb-6 text-sm text-muted-foreground/70"
						>
							{yearlyCount} {yearlyCount === 1 ? "idea" : "ideas"} shared across the org in{" "}
							{new Date().getFullYear()}
						</motion.p>
					)}

					{/* Prompt cards */}
					<motion.div
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.4, delay: 0.25 }}
						className="mb-4 grid w-full grid-cols-2 gap-3 sm:grid-cols-4"
					>
						{suggestedPrompts.slice(0, 4).map((prompt) => (
							<PromptCard
								key={prompt}
								prompt={prompt}
								onClick={() => {
									setInitialPrompt(prompt);
									setHasStarted(true);
								}}
							/>
						))}
					</motion.div>
				</motion.div>

				{/* Chat container */}
				<motion.div
					className="w-full overflow-hidden rounded-2xl border bg-card shadow-lg"
					animate={{
						maxWidth: "42rem",
						height: hasStarted ? "min(calc(100vh - 8rem), 700px)" : "auto",
						minHeight: hasStarted ? "400px" : "0",
					}}
					transition={{ duration: 0.4, ease: "easeInOut" }}
				>
					<ChatInterface
						user={user}
						suggestedPrompts={suggestedPrompts}
						onFirstMessage={() => setHasStarted(true)}
						compact={!hasStarted}
						initialPrompt={initialPrompt}
					/>
				</motion.div>
			</div>
		</main>
	);
}

function PromptCard({ prompt, onClick }: { prompt: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="group rounded-xl border bg-card p-3 text-left text-sm transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-md"
		>
			<span className="text-muted-foreground group-hover:text-foreground">{prompt}</span>
		</button>
	);
}
