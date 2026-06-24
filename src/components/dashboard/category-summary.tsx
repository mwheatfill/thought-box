import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, CheckCircle, Clock, Inbox, Layers } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent } from "#/components/ui/card";
import { KpiCard } from "#/components/ui/kpi-card";

interface CategorySummaryRow {
	id: string;
	name: string;
	role: "owner" | "contributor";
	openCount: number;
	overdueCount: number;
}

interface CategorySummaryData {
	totals: { openCount: number; overdueCount: number; closedCount: number; totalAssigned: number };
	categories: CategorySummaryRow[];
}

export function CategorySummary({ data }: { data: CategorySummaryData }) {
	const { totals, categories } = data;

	return (
		<div className="space-y-6">
			{/* Category-scoped KPIs — each deep-links to the matching All Ideas view. */}
			<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
				<Link to="/ideas" search={{ filter: "open" }} className="block">
					<KpiCard icon={Inbox} label="Open" value={totals.openCount} color="blue" />
				</Link>
				<Link to="/ideas" search={{ filter: "overdue" }} className="block">
					<KpiCard
						icon={AlertTriangle}
						label="Overdue"
						value={totals.overdueCount}
						color={totals.overdueCount > 0 ? "red" : undefined}
						variant={totals.overdueCount > 0 ? "destructive" : undefined}
					/>
				</Link>
				<Link to="/ideas" search={{ filter: "closed" }} className="block">
					<KpiCard icon={CheckCircle} label="Closed" value={totals.closedCount} color="emerald" />
				</Link>
				<Link to="/ideas" search={{}} className="block">
					<KpiCard icon={Clock} label="Total" value={totals.totalAssigned} color="purple" />
				</Link>
			</div>

			{/* Per-category breakdown */}
			<div className="space-y-3">
				<h2 className="text-sm font-semibold text-muted-foreground">My categories</h2>
				{categories.length === 0 ? (
					<Card>
						<CardContent className="flex flex-col items-center gap-2 py-12 text-center">
							<Layers className="size-8 text-muted-foreground" />
							<p className="text-sm font-medium">No categories yet</p>
							<p className="max-w-sm text-sm text-muted-foreground">
								Once you own a category or join a review team, your ideas show up here.
							</p>
						</CardContent>
					</Card>
				) : (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{categories.map((c) => (
							<Link key={c.id} to="/ideas" search={{ category: c.name }} className="block">
								<Card className="transition-colors hover:border-primary/30 hover:bg-muted/30">
									<CardContent className="space-y-3 p-5">
										<div className="flex items-start justify-between gap-2">
											<p className="font-medium">{c.name}</p>
											<Badge
												variant="outline"
												className={
													c.role === "owner"
														? "border-blue-300 text-blue-700 dark:text-blue-300"
														: "border-amber-300 text-amber-700 dark:text-amber-300"
												}
											>
												{c.role === "owner" ? "Owner" : "Contributor"}
											</Badge>
										</div>
										<div className="flex gap-4 text-sm">
											<span className="text-muted-foreground">
												<span className="font-semibold text-foreground">{c.openCount}</span> open
											</span>
											{c.overdueCount > 0 && (
												<span className="text-red-600 dark:text-red-400">
													{c.overdueCount} overdue
												</span>
											)}
										</div>
									</CardContent>
								</Card>
							</Link>
						))}
					</div>
				)}
			</div>

			{/* Quick links */}
			<div className="grid gap-4 sm:grid-cols-3">
				<LinkCard
					to="/ideas"
					title="All Ideas"
					description="Browse every idea in your categories."
				/>
				<LinkCard to="/queue" title="My Queue" description="Ideas you're actively reviewing." />
				<LinkCard to="/my-ideas" title="My Ideas" description="Track your own submissions." />
			</div>
		</div>
	);
}

function LinkCard({ to, title, description }: { to: string; title: string; description: string }) {
	return (
		<Link to={to}>
			<Card className="group transition-colors hover:border-primary/30 hover:bg-muted/30">
				<CardContent className="flex items-center justify-between p-5">
					<div>
						<p className="font-medium">{title}</p>
						<p className="text-sm text-muted-foreground">{description}</p>
					</div>
					<ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
				</CardContent>
			</Card>
		</Link>
	);
}
