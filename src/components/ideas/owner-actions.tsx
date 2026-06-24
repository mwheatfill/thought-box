import { Lock, Plus, X } from "lucide-react";
import { useState } from "react";
import { DualSlaProgress } from "#/components/dashboard/sla-progress";
import { ClosedIdeaPanel } from "#/components/ideas/closed-idea-panel";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Label } from "#/components/ui/label";
import { MentionTextarea, parseMentions } from "#/components/ui/mention-textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { DECLINE_REASONS, type LockedStatus, isLockedStatus } from "#/lib/constants";

interface Owner {
	id: string;
	displayName: string;
	role: string;
	jobTitle: string | null;
	department: string | null;
	photoUrl: string | null;
}

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
	owners: Owner[];
	onSave: (updates: {
		status?: "under_review" | "accepted" | "declined";
		declineReason?: string | null;
		messageToSubmitter?: string | null;
		/**
		 * Optional private note added inline with the status change. Saved as
		 * a separate `internal_note` event so it lives in the dedicated thread
		 * and is never sent to the submitter.
		 */
		internalNote?: string | null;
		/**
		 * User IDs mentioned in `internalNote`. Resolved on the caller side
		 * against the owner directory so server-side notifications can fire
		 * without re-parsing the note text.
		 */
		internalNoteMentions?: string[];
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
	owners,
	onSave,
	isSaving,
}: OwnerActionsProps) {
	const isClosed = isLockedStatus(currentStatus);

	const [status, setStatus] = useState<SelectableStatus>(currentStatus as SelectableStatus);
	const [declineReason, setDeclineReason] = useState(currentDeclineReason ?? "");
	const [messageToSubmitter, setMessageToSubmitter] = useState(currentMessageToSubmitter ?? "");
	const [internalNote, setInternalNote] = useState("");
	const [internalNoteOpen, setInternalNoteOpen] = useState(false);

	const statusChanged = status !== currentStatus;
	const needsMessage = status === "accepted" || status === "declined";
	const needsReason = status === "declined";
	const messageReady = !needsMessage || messageToSubmitter.trim().length > 0;
	const reasonReady = !needsReason || declineReason.length > 0;
	const canSave = statusChanged && messageReady && reasonReady;

	const saveLabel = needsMessage ? "Save and Send Final Update" : "Save Note";

	const handleSave = async () => {
		if (status === "new") return;
		const trimmedNote = internalNote.trim();
		const noteMentions = trimmedNote ? parseMentions(trimmedNote, owners) : [];
		await onSave({
			status,
			messageToSubmitter: needsMessage ? messageToSubmitter.trim() : null,
			declineReason: needsReason ? declineReason : null,
			internalNote: trimmedNote || null,
			internalNoteMentions: noteMentions,
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

								{!internalNoteOpen ? (
									<button
										type="button"
										onClick={() => setInternalNoteOpen(true)}
										className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
									>
										<Plus className="size-3.5" />
										Add an internal note
									</button>
								) : (
									<div className="space-y-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3">
										<div className="flex items-center justify-between gap-2">
											<div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
												<Lock className="size-3.5" />
												<span>
													Internal note <span className="text-muted-foreground/70">(optional)</span>
												</span>
											</div>
											<button
												type="button"
												onClick={() => {
													setInternalNoteOpen(false);
													setInternalNote("");
												}}
												className="rounded p-0.5 hover:bg-foreground/10"
												title="Discard note"
											>
												<X className="size-3.5" />
											</button>
										</div>
										<MentionTextarea
											value={internalNote}
											onChange={setInternalNote}
											directory={owners}
											placeholder="Research, decisions, anything the team should know… Type @ to tag an owner."
											className="min-h-[60px] resize-none"
										/>
										<p className="text-xs text-muted-foreground">
											Owners &amp; admins only. Submitters never see this. Tagged owners get an
											email.
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
