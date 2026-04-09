import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Lightbulb, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import type { AuthUser } from "#/server/middleware/auth";
import { StatusBadge } from "./status-badge";

interface SubmitterIdea {
	id: string;
	submissionId: string;
	title: string;
	status: string;
	categoryName: string;
	submittedAt: string;
}

interface SubmitterDashboardProps {
	user: AuthUser;
	ideas: SubmitterIdea[];
	yearlyCount: number;
}

export function SubmitterDashboard({ user, ideas, yearlyCount }: SubmitterDashboardProps) {
	const firstName = user.displayName.split(" ")[0];

	return (
		<div className="space-y-6">
			{/* Stat card */}
			<Card>
				<CardContent className="flex items-center gap-4 p-6">
					<div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900/30">
						<Lightbulb className="size-6 text-amber-600 dark:text-amber-400" />
					</div>
					<div>
						<p className="text-2xl font-bold">{yearlyCount}</p>
						<p className="text-sm text-muted-foreground">
							{yearlyCount === 0
								? `${firstName}, you haven't shared an idea yet this year`
								: yearlyCount === 1
									? "idea shared this year — great start!"
									: "ideas shared this year — keep it up!"}
						</p>
					</div>
				</CardContent>
			</Card>

			{/* Ideas list */}
			{ideas.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center p-12 text-center">
						<div className="mb-4 rounded-full bg-muted p-4">
							<Sparkles className="size-8 text-muted-foreground" />
						</div>
						<h2 className="mb-2 text-lg font-semibold">You haven't shared an idea yet</h2>
						<p className="mb-4 max-w-sm text-sm text-muted-foreground">
							It only takes a minute, and every idea helps. Head to the Submit page and tell us
							what's on your mind.
						</p>
						<Link
							to="/"
							className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
						>
							Share an idea
						</Link>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardHeader>
						<CardTitle>My Ideas</CardTitle>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[100px]">ID</TableHead>
									<TableHead>Title</TableHead>
									<TableHead>Category</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="text-right">Submitted</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{ideas.map((idea) => (
									<TableRow key={idea.id} className="cursor-pointer hover:bg-muted/50">
										<TableCell className="font-mono text-xs">{idea.submissionId}</TableCell>
										<TableCell>
											<Link
												to="/ideas/$submissionId"
												params={{ submissionId: idea.submissionId }}
												className="font-medium hover:underline"
											>
												{idea.title}
											</Link>
										</TableCell>
										<TableCell className="text-muted-foreground">{idea.categoryName}</TableCell>
										<TableCell>
											<StatusBadge
												status={idea.status as Parameters<typeof StatusBadge>[0]["status"]}
											/>
										</TableCell>
										<TableCell className="text-right text-muted-foreground">
											{formatDistanceToNow(new Date(idea.submittedAt), { addSuffix: true })}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
