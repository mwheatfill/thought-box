import { Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Bell,
	CheckCircle2,
	Lightbulb,
	MessageCircle,
	Plus,
	UserCheck,
} from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { FadeIn } from "#/components/ui/animated";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";

const NEXT_STEPS = [
	{
		icon: UserCheck,
		color: "bg-primary/10 text-primary",
		title: "Assigned for review",
		description: "A category leader will review your idea",
	},
	{
		icon: MessageCircle,
		color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
		title: "They may follow up",
		description: "You might hear from them with questions or next steps",
	},
	{
		icon: Bell,
		color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
		title: "You'll stay in the loop",
		description: "We'll notify you as your idea moves forward",
	},
] as const;

interface IdeaSubmittedCardProps {
	submissionId: string;
	title: string;
	categoryName: string;
	onNewIdea?: () => void;
	children?: ReactNode;
}

export function IdeaSubmittedCard({
	submissionId,
	title,
	categoryName,
	onNewIdea,
	children,
}: IdeaSubmittedCardProps) {
	return (
		<FadeIn className="w-full max-w-lg space-y-5 p-6">
			{/* Celebration header */}
			<div className="flex flex-col items-center gap-3 text-center">
				<motion.div
					initial={{ scale: 0 }}
					animate={{ scale: 1 }}
					transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.15 }}
					className="rounded-full bg-green-100 p-4 dark:bg-green-900/40"
				>
					<CheckCircle2 className="size-10 text-green-600 dark:text-green-400" />
				</motion.div>
				<FadeIn delay={0.25}>
					<h3 className="text-xl font-semibold">Thank you!</h3>
					<p className="mt-1.5 text-sm text-muted-foreground">
						Your idea has been assigned to the{" "}
						<span className="font-medium text-foreground">{categoryName}</span> category for review.
					</p>
				</FadeIn>
			</div>

			{/* Idea summary */}
			<FadeIn delay={0.35} className="rounded-xl border bg-muted/30 p-4">
				<div className="mb-2 flex items-center gap-2">
					<Lightbulb className="size-4 text-primary" />
					<span className="text-xs font-semibold text-primary">{submissionId}</span>
				</div>
				<p className="text-sm font-medium leading-snug">{title}</p>
			</FadeIn>

			{/* What happens next */}
			<FadeIn delay={0.45} className="space-y-3">
				<Separator />
				<p className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
					What happens next
				</p>
				<div className="grid gap-2.5">
					{NEXT_STEPS.map((step) => (
						<div key={step.title} className="flex items-start gap-3 rounded-lg border bg-card p-3">
							<div className={`rounded-md p-1.5 ${step.color.split(" ")[0]}`}>
								<step.icon className={`size-3.5 ${step.color.split(" ").slice(1).join(" ")}`} />
							</div>
							<div>
								<p className="text-xs font-medium">{step.title}</p>
								<p className="text-xs text-muted-foreground">{step.description}</p>
							</div>
						</div>
					))}
				</div>
			</FadeIn>

			{/* Drop zone for attachments */}
			{children && (
				<FadeIn delay={0.55} className="space-y-2">
					<p className="text-center text-xs text-muted-foreground">
						Have supporting files? Add them to your idea.
					</p>
					{children}
				</FadeIn>
			)}

			{/* Action buttons */}
			<FadeIn delay={0.6} className="flex gap-3">
				<Button asChild className="flex-1 gap-2">
					<Link to="/ideas/$submissionId" params={{ submissionId }}>
						View Idea
						<ArrowRight className="size-4" />
					</Link>
				</Button>
				{onNewIdea && (
					<Button variant="secondary" className="flex-1 gap-2" onClick={onNewIdea}>
						<Plus className="size-4" />
						Submit Another
					</Button>
				)}
			</FadeIn>
		</FadeIn>
	);
}
