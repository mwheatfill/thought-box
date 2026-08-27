import { useState } from "react";
import { DualSlaProgress } from "#/components/dashboard/sla-progress";
import { ClosedIdeaPanel } from "#/components/ideas/closed-idea-panel";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { DECLINE_REASONS, type LockedStatus, isLockedStatus } from "#/lib/constants";

interface OwnerActionsProps {
	currentStatus: string;
	currentDeclineReason: string | null;
	currentMessageToSubmitter: string | null;
	slaDaysRemaining: number | null;
	slaDueDate: string | null;
	closureSlaDueDate: string | null;
	closureSlaDaysRemaining: number | null;
	submittedAt: string;
	closedAt: string | null;
	assignedOwnerName: string | null;
	assignedOwnerId: string | null;
	assignedOwnerPhotoUrl: string | null;
	onSave: (updates: {
		status?: "under_review" | "accepted" | "declined";
		declineReason?: string | null;
		messageToSubmitter?: string | null;
	}) => Promise<void>;
	isSaving: boolean;
}

type SelectableStatus = "new" | "under_review" | "accepted" | "declined";

export function OwnerActions({
	currentStatus,
	currentDeclineReason,
	currentMessageToSubmitter,
	slaDaysRemaining,
	slaDueDate,
	closureSlaDueDate,
	closureSlaDaysRemaining,
	submittedAt,
	closedAt,
	assignedOwnerName,
	assignedOwnerId,
	assignedOwnerPhotoUrl,
	onSave,
	isSaving,
}: OwnerActionsProps) {
	const isClosed = isLockedStatus(currentStatus);

	const [status, setStatus] = useState<SelectableStatus>(currentStatus as SelectableStatus);
	const [declineReason, setDeclineReason] = useState(currentDeclineReason ?? "");
	const [messageToSubmitter, setMessageToSubmitter] = useState(currentMessageToSubmitter ?? "");

	const statusChanged = status !== currentStatus;
	const needsMessage = status === "accepted" || status === "declined";
	const needsReason = status === "declined";
	const messageReady = !needsMessage || messageToSubmitter.trim().length > 0;
	const reasonReady = !needsReason || declineReason.length > 0;
	const canSave = statusChanged && messageReady && reasonReady;

	const saveLabel = needsMessage ? "Save and Send Final Update" : "Save Status";

	const handleSave = async () => {
		if (status === "new") return;
		await onSave({
			status,
			messageToSubmitter: needsMessage ? messageToSubmitter.trim() : null,
			declineReason: needsReason ? declineReason : null,
		});
	};

	return (
		<div className="space-y-4">
			{/* Closed idea: summary panel replaces SLA/reassign/locked banner */}
			{isClosed && (
				<ClosedIdeaPanel
					status={currentStatus as LockedStatus}
					declineReason={currentDeclineReason}
					closedAt={closedAt}
					submittedAt={submittedAt}
					assignedOwner={
						assignedOwnerId && assignedOwnerName
							? {
									id: assignedOwnerId,
									displayName: assignedOwnerName,
									photoUrl: assignedOwnerPhotoUrl,
								}
							: null
					}
				/>
			)}

			{/* SLA & Assignment — open ideas only */}
			{!isClosed && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-sm font-medium">SLA</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<DualSlaProgress
							reviewSlaDaysRemaining={slaDaysRemaining}
							reviewSlaDueDate={slaDueDate}
							closureSlaDaysRemaining={closureSlaDaysRemaining}
							closureSlaDueDate={closureSlaDueDate}
						/>
					</CardContent>
				</Card>
			)}

			{/* Actions */}
			{!isClosed && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-sm font-medium">Actions</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						{/* Status change. `new` shows as the current state when applicable but
						    can't be selected — an idea only returns to New via Change Category
						    or Reopen (both in the Reviewer & routing card). */}
						<div className="space-y-1.5">
							<Label htmlFor="status">Status</Label>
							<Select value={status} onValueChange={(v) => setStatus(v as SelectableStatus)}>
								<SelectTrigger id="status">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="new" disabled>
										<span>New</span>
										<span className="ml-1 text-xs text-muted-foreground">— Untouched</span>
									</SelectItem>
									<SelectItem value="under_review">
										<span>Under Review</span>
										<span className="ml-1 text-xs text-muted-foreground">— Researching</span>
									</SelectItem>
									<SelectItem value="accepted">
										<span>Accepted</span>
										<span className="ml-1 text-xs text-muted-foreground">— Moving forward</span>
									</SelectItem>
									<SelectItem value="declined">
										<span>Declined</span>
										<span className="ml-1 text-xs text-muted-foreground">— Not moving forward</span>
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{statusChanged && (
							<>
								{needsReason && (
									<div className="space-y-1.5">
										<Label htmlFor="decline-reason">
											Decline reason <span className="text-red-600">*</span>
										</Label>
										<Select value={declineReason} onValueChange={setDeclineReason}>
											<SelectTrigger id="decline-reason">
												<SelectValue placeholder="Select a reason..." />
											</SelectTrigger>
											<SelectContent>
												{Object.entries(DECLINE_REASONS).map(([key, label]) => (
													<SelectItem key={key} value={key}>
														{label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}

								{needsMessage && (
									<div className="space-y-1.5">
										<Label htmlFor="message-to-submitter">
											Message to Submitter <span className="text-red-600">*</span>
										</Label>
										<Textarea
											id="message-to-submitter"
											value={messageToSubmitter}
											onChange={(e) => setMessageToSubmitter(e.target.value)}
											placeholder="What should the submitter know?"
											className="min-h-[100px] resize-none"
										/>
										<p className="text-xs text-muted-foreground">
											Sent on save. Cannot be edited later.
										</p>
									</div>
								)}

								<Button onClick={handleSave} disabled={!canSave || isSaving} className="w-full">
									{isSaving ? "Saving..." : saveLabel}
								</Button>
							</>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
