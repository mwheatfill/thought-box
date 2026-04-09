import { useState } from "react";
import { SlaIndicator } from "#/components/dashboard/sla-indicator";
import { StatusBadge } from "#/components/dashboard/status-badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import type { IdeaStatus } from "#/lib/constants";

interface LeaderActionsProps {
	ideaId: string;
	currentStatus: string;
	currentRejectionReason: string | null;
	currentLeaderNotes: string | null;
	currentActionTaken: string | null;
	currentJiraTicket: string | null;
	slaStatus: "on_track" | "approaching" | "overdue" | "none";
	slaDaysRemaining: number | null;
	slaDueDate: string | null;
	assignedLeaderName: string | null;
	onSave: (updates: {
		status?: string;
		rejectionReason?: string | null;
		leaderNotes?: string | null;
		actionTaken?: string | null;
		jiraTicketNumber?: string | null;
	}) => Promise<void>;
	isSaving: boolean;
}

export function LeaderActions({
	currentStatus,
	currentRejectionReason,
	currentLeaderNotes,
	currentActionTaken,
	currentJiraTicket,
	slaStatus,
	slaDaysRemaining,
	slaDueDate,
	assignedLeaderName,
	onSave,
	isSaving,
}: LeaderActionsProps) {
	const [status, setStatus] = useState(currentStatus);
	const [rejectionReason, setRejectionReason] = useState(currentRejectionReason ?? "");
	const [leaderNotes, setLeaderNotes] = useState(currentLeaderNotes ?? "");
	const [actionTaken, setActionTaken] = useState(currentActionTaken ?? "");
	const [jiraTicket, setJiraTicket] = useState(currentJiraTicket ?? "");

	const hasChanges =
		status !== currentStatus ||
		leaderNotes !== (currentLeaderNotes ?? "") ||
		actionTaken !== (currentActionTaken ?? "") ||
		jiraTicket !== (currentJiraTicket ?? "") ||
		(status === "declined" && rejectionReason !== (currentRejectionReason ?? ""));

	const handleSave = async () => {
		const updates: Record<string, unknown> = {};

		if (status !== currentStatus) updates.status = status;
		if (leaderNotes !== (currentLeaderNotes ?? "")) updates.leaderNotes = leaderNotes || null;
		if (actionTaken !== (currentActionTaken ?? "")) updates.actionTaken = actionTaken || null;
		if (jiraTicket !== (currentJiraTicket ?? "")) updates.jiraTicketNumber = jiraTicket || null;
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

					{assignedLeaderName && (
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Assigned to</span>
							<span className="text-sm font-medium">{assignedLeaderName}</span>
						</div>
					)}
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

					{/* Jira ticket */}
					<div className="space-y-1.5">
						<Label htmlFor="jira-ticket">Jira Ticket</Label>
						<Input
							id="jira-ticket"
							value={jiraTicket}
							onChange={(e) => setJiraTicket(e.target.value)}
							placeholder="PROJ-1234"
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
