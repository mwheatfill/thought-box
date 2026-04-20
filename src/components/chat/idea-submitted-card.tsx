import { Link } from "@tanstack/react-router";
import { ArrowRight, Lightbulb } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";

interface IdeaSubmittedCardProps {
	submissionId: string;
	title: string;
	categoryName: string;
	assignedLeaderName: string | null;
	children?: ReactNode;
}

export function IdeaSubmittedCard({
	submissionId,
	title,
	categoryName,
	assignedLeaderName,
	children,
}: IdeaSubmittedCardProps) {
	return (
		<Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
					<Lightbulb className="size-5" />
					Idea Submitted!
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2 text-sm">
				<p>
					<span className="font-medium">ID:</span> {submissionId}
				</p>
				<p>
					<span className="font-medium">Title:</span> {title}
				</p>
				<p>
					<span className="font-medium">Category:</span> {categoryName}
				</p>
				{assignedLeaderName && (
					<p>
						<span className="font-medium">Reviewer:</span> {assignedLeaderName}
					</p>
				)}
				{children && <div className="mt-3">{children}</div>}
				<Button asChild variant="outline" size="sm" className="mt-2 w-full">
					<Link to="/ideas/$submissionId" params={{ submissionId }}>
						View Idea
						<ArrowRight className="ml-2 size-3.5" />
					</Link>
				</Button>
			</CardContent>
		</Card>
	);
}
