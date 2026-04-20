import { createFileRoute } from "@tanstack/react-router";
import { Lightbulb } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { ChatInterface } from "#/components/chat/chat-interface";
import { FallbackForm } from "#/components/chat/fallback-form";
import { getLandingData } from "#/server/functions/landing";

export const Route = createFileRoute("/")({
	loader: () => getLandingData(),
	component: LandingPage,
});

function getGreeting(): string {
	const hour = new Date().getHours();
	if (hour < 12) return "Good morning";
	if (hour < 17) return "Good afternoon";
	return "Good evening";
}

function LandingPage() {
	const { user } = Route.useRouteContext();
	const { yearlyCount, suggestedPrompts, categories } = Route.useLoaderData();
	const [hasStarted, setHasStarted] = useState(false);
	const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
	const [chatFailed, setChatFailed] = useState(false);
	const [chatKey, setChatKey] = useState(0);

	const handleReset = () => {
		setHasStarted(false);
		setInitialPrompt(null);
		setChatFailed(false);
		setChatKey((k) => k + 1);
	};
	const firstName = user.displayName.split(" ")[0];

	return (
		<main className="-mt-12 flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-blue-100/60 via-indigo-50/30 to-background px-4 pt-12 dark:from-background dark:via-background dark:to-background">
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
				}}
				transition={{ duration: 0.4, ease: "easeInOut" }}
			>
				{chatFailed ? (
					<FallbackForm categories={categories} />
				) : (
					<ChatInterface
						key={chatKey}
						user={user}
						suggestedPrompts={suggestedPrompts}
						onFirstMessage={() => setHasStarted(true)}
						onReset={handleReset}
						onError={() => {
							setHasStarted(true);
							setChatFailed(true);
						}}
						compact={!hasStarted}
						initialPrompt={initialPrompt}
					/>
				)}
			</motion.div>
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
