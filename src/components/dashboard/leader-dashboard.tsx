import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle, Clock, Inbox } from "lucide-react";
import { useState } from "react";
import { FadeIn } from "#/components/ui/animated";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
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
	submitterPhotoUrl: string | null;
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
	onBulkUpdate?: (ideaIds: string[], status: string) => Promise<void>;
	isBulkUpdating?: boolean;
}

export function LeaderDashboard({
	ideas,
	stats,
	onBulkUpdate,
	isBulkUpdating,
}: LeaderDashboardProps) {
	const openStatuses = ["new", "under_review", "in_progress"];
	const openIdeas = ideas.filter((i) => openStatuses.includes(i.status));
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [bulkStatus, setBulkStatus] = useState("under_review");

	const toggleSelect = (id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const toggleAll = () => {
		if (selected.size === openIdeas.length) {
			setSelected(new Set());
		} else {
			setSelected(new Set(openIdeas.map((i) => i.id)));
		}
	};

	return (
		<div className="space-y-6">
			{/* KPI row */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<FadeIn delay={0}>
					<KpiCard icon={Inbox} label="My Open" value={stats.openCount} />
				</FadeIn>
				<FadeIn delay={0.05}>
					<KpiCard
						icon={AlertTriangle}
						label="Overdue"
						value={stats.overdueCount}
						variant={stats.overdueCount > 0 ? "destructive" : "default"}
					/>
				</FadeIn>
				<FadeIn delay={0.1}>
					<KpiCard icon={CheckCircle} label="Total Assigned" value={stats.totalAssigned} />
				</FadeIn>
				<FadeIn delay={0.15}>
					<KpiCard
						icon={Clock}
						label="Open Rate"
						value={
							stats.totalAssigned > 0
								? `${Math.round((stats.openCount / stats.totalAssigned) * 100)}%`
								: "—"
						}
					/>
				</FadeIn>
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
					<CardHeader className="flex-row items-center justify-between space-y-0">
						<CardTitle>Assigned Ideas</CardTitle>
						{/* Bulk action bar */}
						{selected.size > 0 && onBulkUpdate && (
							<div className="flex items-center gap-2">
								<span className="text-sm text-muted-foreground">{selected.size} selected</span>
								<Select value={bulkStatus} onValueChange={setBulkStatus}>
									<SelectTrigger className="h-8 w-[150px]">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="under_review">Under Review</SelectItem>
										<SelectItem value="accepted">Accepted</SelectItem>
										<SelectItem value="in_progress">In Progress</SelectItem>
										<SelectItem value="declined">Declined</SelectItem>
									</SelectContent>
								</Select>
								<Button
									size="sm"
									disabled={isBulkUpdating}
									onClick={async () => {
										await onBulkUpdate(Array.from(selected), bulkStatus);
										setSelected(new Set());
									}}
								>
									{isBulkUpdating ? "Updating..." : "Apply"}
								</Button>
							</div>
						)}
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[40px]">
										<input
											type="checkbox"
											checked={selected.size === openIdeas.length && openIdeas.length > 0}
											onChange={toggleAll}
											className="size-4 rounded border-input"
										/>
									</TableHead>
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
											selected.has(idea.id) && "bg-primary/5",
										)}
									>
										<TableCell>
											<input
												type="checkbox"
												checked={selected.has(idea.id)}
												onChange={() => toggleSelect(idea.id)}
												className="size-4 rounded border-input"
											/>
										</TableCell>
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
										<TableCell>
											<div className="flex items-center gap-2">
												<Avatar className="size-6">
													{idea.submitterPhotoUrl && (
														<AvatarImage src={idea.submitterPhotoUrl} alt={idea.submitterName} />
													)}
													<AvatarFallback className="text-[10px]">
														{idea.submitterName
															.split(" ")
															.map((n) => n[0])
															.join("")
															.slice(0, 2)}
													</AvatarFallback>
												</Avatar>
												<span className="text-muted-foreground">{idea.submitterName}</span>
											</div>
										</TableCell>
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
