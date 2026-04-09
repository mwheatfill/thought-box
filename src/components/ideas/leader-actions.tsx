import { ChevronsUpDown, RefreshCw } from "lucide-react";
import { useState } from "react";
import { SlaIndicator } from "#/components/dashboard/sla-indicator";
import { StatusBadge } from "#/components/dashboard/status-badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import type { IdeaStatus } from "#/lib/constants";
import { cn } from "#/lib/utils";

interface Leader {
	id: string;
	displayName: string;
	role: string;
}

interface LeaderActionsProps {
	ideaId: string;
	currentStatus: string;
	currentRejectionReason: string | null;
	currentLeaderNotes: string | null;
	currentActionTaken: string | null;
	slaStatus: "on_track" | "approaching" | "overdue" | "none";
	slaDaysRemaining: number | null;
	slaDueDate: string | null;
	assignedLeaderName: string | null;
	assignedLeaderId: string | null;
	leaders: Leader[];
	onSave: (updates: {
		status?: string;
		rejectionReason?: string | null;
		leaderNotes?: string | null;
		actionTaken?: string | null;
	}) => Promise<void>;
	onReassign: (newLeaderId: string) => Promise<void>;
	isSaving: boolean;
	isReassigning: boolean;
}

export function LeaderActions({
	currentStatus,
	currentRejectionReason,
	currentLeaderNotes,
	currentActionTaken,
	slaStatus,
	slaDaysRemaining,
	slaDueDate,
	assignedLeaderName,
	assignedLeaderId,
	leaders,
	onSave,
	onReassign,
	isSaving,
	isReassigning,
}: LeaderActionsProps) {
	const [status, setStatus] = useState(currentStatus);
	const [rejectionReason, setRejectionReason] = useState(currentRejectionReason ?? "");
	const [leaderNotes, setLeaderNotes] = useState(currentLeaderNotes ?? "");
	const [actionTaken, setActionTaken] = useState(currentActionTaken ?? "");
	const [reassignOpen, setReassignOpen] = useState(false);

	const hasChanges =
		status !== currentStatus ||
		leaderNotes !== (currentLeaderNotes ?? "") ||
		actionTaken !== (currentActionTaken ?? "") ||
		(status === "declined" && rejectionReason !== (currentRejectionReason ?? ""));

	const handleSave = async () => {
		const updates: Record<string, unknown> = {};

		if (status !== currentStatus) updates.status = status;
		if (leaderNotes !== (currentLeaderNotes ?? "")) updates.leaderNotes = leaderNotes || null;
		if (actionTaken !== (currentActionTaken ?? "")) updates.actionTaken = actionTaken || null;
		if (status === "declined") {
			updates.rejectionReason = rejectionReason || null;
		}

		await onSave(updates);
	};

	return (
		<div className="space-y-4">
			{/* Status & SLA */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm font-medium">Status & SLA</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center justify-between">
						<span className="text-sm text-muted-foreground">Current</span>
						<StatusBadge status={currentStatus as IdeaStatus} />
					</div>

					<SlaIndicator
						slaStatus={slaStatus}
						slaDaysRemaining={slaDaysRemaining}
						slaDueDate={slaDueDate}
					/>

					{/* Assigned leader with reassign */}
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Assigned to</span>
							<span className="text-sm font-medium">{assignedLeaderName ?? "Unassigned"}</span>
						</div>
						<Popover open={reassignOpen} onOpenChange={setReassignOpen}>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									className="w-full justify-between font-normal"
									disabled={isReassigning}
								>
									<span className="flex items-center gap-2">
										<RefreshCw className={cn("size-3.5", isReassigning && "animate-spin")} />
										{isReassigning ? "Assigning..." : assignedLeaderId ? "Reassign" : "Assign"}
									</span>
									<ChevronsUpDown className="size-3.5 opacity-50" />
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
								<Command>
									<CommandInput placeholder="Search leaders..." />
									<CommandList>
										<CommandEmpty>No leaders found.</CommandEmpty>
										<CommandGroup>
											{leaders
												.filter((l) => l.id !== assignedLeaderId)
												.map((l) => (
													<CommandItem
														key={l.id}
														value={l.displayName}
														onSelect={() => {
															setReassignOpen(false);
															onReassign(l.id);
														}}
													>
														{l.displayName}
														<span className="ml-auto text-xs text-muted-foreground capitalize">
															{l.role}
														</span>
													</CommandItem>
												))}
										</CommandGroup>
									</CommandList>
								</Command>
							</PopoverContent>
						</Popover>
					</div>
				</CardContent>
			</Card>

			{/* Actions */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-sm font-medium">Actions</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Status change */}
					<div className="space-y-1.5">
						<Label htmlFor="status">Status</Label>
						<Select value={status} onValueChange={setStatus}>
							<SelectTrigger id="status">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="new">New</SelectItem>
								<SelectItem value="under_review">Under Review</SelectItem>
								<SelectItem value="accepted">Accepted</SelectItem>
								<SelectItem value="in_progress">In Progress</SelectItem>
								<SelectItem value="implemented">Implemented</SelectItem>
								<SelectItem value="declined">Declined</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Rejection reason (only when declined) */}
					{status === "declined" && (
						<div className="space-y-1.5">
							<Label htmlFor="rejection-reason">Rejection Reason</Label>
							<Select value={rejectionReason} onValueChange={setRejectionReason}>
								<SelectTrigger id="rejection-reason">
									<SelectValue placeholder="Select a reason..." />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="already_in_progress">Already in progress</SelectItem>
									<SelectItem value="not_feasible">Not feasible at this time</SelectItem>
									<SelectItem value="not_aligned">Not aligned with priorities</SelectItem>
									<SelectItem value="not_thoughtbox">Not a ThoughtBox idea</SelectItem>
								</SelectContent>
							</Select>
						</div>
					)}

					{/* Leader notes */}
					<div className="space-y-1.5">
						<Label htmlFor="leader-notes">Leader Notes</Label>
						<Textarea
							id="leader-notes"
							value={leaderNotes}
							onChange={(e) => setLeaderNotes(e.target.value)}
							placeholder="Research, decisions, context..."
							className="min-h-[80px] resize-none"
						/>
					</div>

					{/* Action taken */}
					<div className="space-y-1.5">
						<Label htmlFor="action-taken">Action Taken</Label>
						<Input
							id="action-taken"
							value={actionTaken}
							onChange={(e) => setActionTaken(e.target.value)}
							placeholder="What was done..."
						/>
					</div>

					<Button onClick={handleSave} disabled={!hasChanges || isSaving} className="w-full">
						{isSaving ? "Saving..." : "Save Changes"}
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
