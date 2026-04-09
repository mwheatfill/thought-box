import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle, Clock, Inbox } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { cn } from "#/lib/utils";
import { SlaIndicator } from "./sla-indicator";
import { StatusBadge } from "./status-badge";

interface LeaderIdea {
	id: string;
	submissionId: string;
	title: string;
	status: string;
	categoryName: string;
	submitterName: string;
	submittedAt: string;
	slaDueDate: string | null;
	slaDaysRemaining: number | null;
	slaStatus: "on_track" | "approaching" | "overdue" | "none";
}

interface LeaderStats {
	openCount: number;
	overdueCount: number;
	totalAssigned: number;
}

interface LeaderDashboardProps {
	ideas: LeaderIdea[];
	stats: LeaderStats;
}

export function LeaderDashboard({ ideas, stats }: LeaderDashboardProps) {
	const openStatuses = ["new", "under_review", "in_progress"];
	const openIdeas = ideas.filter((i) => openStatuses.includes(i.status));

	return (
		<div className="space-y-6">
			{/* KPI row */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<KpiCard icon={Inbox} label="My Open" value={stats.openCount} />
				<KpiCard
					icon={AlertTriangle}
					label="Overdue"
					value={stats.overdueCount}
					variant={stats.overdueCount > 0 ? "destructive" : "default"}
				/>
				<KpiCard icon={CheckCircle} label="Total Assigned" value={stats.totalAssigned} />
				<KpiCard
					icon={Clock}
					label="Open Rate"
					value={
						stats.totalAssigned > 0
							? `${Math.round((stats.openCount / stats.totalAssigned) * 100)}%`
							: "—"
					}
				/>
			</div>

			{/* Ideas table */}
			{openIdeas.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center p-12 text-center">
						<div className="mb-4 rounded-full bg-green-100 p-4 dark:bg-green-900/30">
							<CheckCircle className="size-8 text-green-600 dark:text-green-400" />
						</div>
						<h2 className="mb-2 text-lg font-semibold">All caught up!</h2>
						<p className="max-w-sm text-sm text-muted-foreground">
							You have no open ideas to review. Great work staying on top of things.
						</p>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardHeader>
						<CardTitle>Assigned Ideas</CardTitle>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[100px]">ID</TableHead>
									<TableHead>Title</TableHead>
									<TableHead>Submitter</TableHead>
									<TableHead>Category</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>SLA</TableHead>
									<TableHead className="text-right">Submitted</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{openIdeas.map((idea) => (
									<TableRow
										key={idea.id}
										className={cn(
											"cursor-pointer hover:bg-muted/50",
											idea.slaStatus === "overdue" && "bg-destructive/5",
										)}
									>
										<TableCell className="font-mono text-xs">{idea.submissionId}</TableCell>
										<TableCell>
											<Link
												to="/ideas/$ideaId"
												params={{ ideaId: idea.id }}
												className="font-medium hover:underline"
											>
												{idea.title}
											</Link>
										</TableCell>
										<TableCell className="text-muted-foreground">{idea.submitterName}</TableCell>
										<TableCell className="text-muted-foreground">{idea.categoryName}</TableCell>
										<TableCell>
											<StatusBadge
												status={idea.status as Parameters<typeof StatusBadge>[0]["status"]}
											/>
										</TableCell>
										<TableCell>
											<SlaIndicator
												slaStatus={idea.slaStatus}
												slaDaysRemaining={idea.slaDaysRemaining}
												slaDueDate={idea.slaDueDate}
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

// ── KPI Card ──────────────────────────────────────────────────────────────

function KpiCard({
	icon: Icon,
	label,
	value,
	variant = "default",
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: number | string;
	variant?: "default" | "destructive";
}) {
	return (
		<Card>
			<CardContent className="flex items-center gap-4 p-4">
				<div
					className={cn(
						"rounded-full p-2",
						variant === "destructive" ? "bg-red-100 dark:bg-red-900/30" : "bg-muted",
					)}
				>
					<Icon
						className={cn(
							"size-4",
							variant === "destructive"
								? "text-red-600 dark:text-red-400"
								: "text-muted-foreground",
						)}
					/>
				</div>
				<div>
					<p
						className={cn(
							"text-2xl font-bold",
							variant === "destructive" && "text-red-600 dark:text-red-400",
						)}
					>
						{value}
					</p>
					<p className="text-xs text-muted-foreground">{label}</p>
				</div>
			</CardContent>
		</Card>
	);
}
