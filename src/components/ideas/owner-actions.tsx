import { ChevronsUpDown, RefreshCw } from "lucide-react";
import { useState } from "react";
import { DualSlaProgress } from "#/components/dashboard/sla-progress";
import { ClosedIdeaPanel } from "#/components/ideas/closed-idea-panel";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
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
import { UserCardPopover } from "#/components/ui/user-card";
import {
	DECLINE_REASONS,
	IMPACT_AREAS,
	REASSIGNMENT_REASONS,
	type ReassignmentReason,
} from "#/lib/constants";
import { cn } from "#/lib/utils";

interface Owner {
	id: string;
	displayName: string;
	role: string;
	jobTitle: string | null;
	department: string | null;
	photoUrl: string | null;
}

interface OwnerActionsProps {
	ideaId: string;
	submissionId: string;
	ideaTitle: string;
	categoryName: string;
	impactArea: string | null;
	userRole: string;
	currentStatus: string;
	currentDeclineReason: string | null;
	currentMessageToSubmitter: string | null;
	slaStatus: "on_track" | "approaching" | "overdue" | "none";
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
	}) => Promise<void>;
	onReassign: (input: {
		newOwnerId: string;
		reason?: ReassignmentReason;
		note?: string;
	}) => Promise<void>;
	onReassignComplete?: () => void;
	isSaving: boolean;
	isReassigning: boolean;
}

type SelectableStatus = "new" | "under_review" | "accepted" | "declined";

export function OwnerActions({
	submissionId,
	ideaTitle,
	categoryName,
	impactArea,
	userRole,
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
	onReassign,
	onReassignComplete,
	isSaving,
	isReassigning,
}: OwnerActionsProps) {
	const closedStatuses = ["accepted", "declined", "redirected"];
	const isClosed = closedStatuses.includes(currentStatus);

	const [status, setStatus] = useState<SelectableStatus>(currentStatus as SelectableStatus);
	const [declineReason, setDeclineReason] = useState(currentDeclineReason ?? "");
	const [messageToSubmitter, setMessageToSubmitter] = useState(currentMessageToSubmitter ?? "");
	const [reassignOpen, setReassignOpen] = useState(false);
	const [pendingReassign, setPendingReassign] = useState<Owner | null>(null);
	const [reassignReason, setReassignReason] = useState<ReassignmentReason | "">("");
	const [reassignNote, setReassignNote] = useState("");

	const statusChanged = status !== currentStatus;
	const needsMessage = status === "accepted" || status === "declined";
	const needsReason = status === "declined";
	const messageReady = !needsMessage || messageToSubmitter.trim().length > 0;
	const reasonReady = !needsReason || declineReason.length > 0;
	const canSave = statusChanged && messageReady && reasonReady;

	const saveLabel = needsMessage ? "Save and Send Final Update" : "Save and Send Update";

	const handleSave = async () => {
		if (status === "new" || !statusChanged) return;
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
					status={currentStatus as "accepted" | "declined" | "redirected"}
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

						{/* Assigned owner with reassign */}
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<span className="text-sm text-muted-foreground">Assigned to</span>
								{assignedOwnerId ? (
									<UserCardPopover userId={assignedOwnerId}>
										<button type="button" className="flex items-center gap-2 hover:text-primary">
											<Avatar className="size-6">
												{assignedOwnerPhotoUrl && (
													<AvatarImage src={assignedOwnerPhotoUrl} alt={assignedOwnerName ?? ""} />
												)}
												<AvatarFallback className="text-[10px]">
													{(assignedOwnerName ?? "")
														.split(" ")
														.map((n) => n[0])
														.join("")
														.slice(0, 2)}
												</AvatarFallback>
											</Avatar>
											<span className="text-sm font-medium hover:underline">
												{assignedOwnerName}
											</span>
										</button>
									</UserCardPopover>
								) : (
									<span className="text-sm font-medium">Unassigned</span>
								)}
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
											{isReassigning ? "Assigning..." : assignedOwnerId ? "Reassign" : "Assign"}
										</span>
										<ChevronsUpDown className="size-3.5 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
									<Command>
										<CommandInput placeholder="Search owners..." />
										<CommandList>
											<CommandEmpty>No owners found.</CommandEmpty>
											<CommandGroup>
												{owners
													.filter((l) => l.id !== assignedOwnerId)
													.map((l) => (
														<CommandItem
															key={l.id}
															value={l.displayName}
															onSelect={() => {
																setReassignOpen(false);
																setPendingReassign(l);
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
			)}

			{/* Actions */}
			{!isClosed && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-sm font-medium">Actions</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						{/* Status change. `new` is shown as the current state when applicable
						    but cannot be selected — reassignment is the only path back. */}
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

						{/* Decline reason — required when status is being set to declined */}
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

						{/* Message to submitter — required for accepted/declined */}
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
					</CardContent>
				</Card>
			)}

			{/* Reassign confirmation */}
			<AlertDialog
				open={!!pendingReassign}
				onOpenChange={(open) => {
					if (!open) {
						setPendingReassign(null);
						setReassignReason("");
						setReassignNote("");
					}
				}}
			>
				<AlertDialogContent className="max-w-md">
					<AlertDialogHeader>
						<AlertDialogTitle>
							{assignedOwnerId ? "Reassign this idea?" : "Assign this idea?"}
						</AlertDialogTitle>
					</AlertDialogHeader>

					{/* Idea context */}
					<div className="rounded-lg border bg-muted/30 p-3">
						<p className="font-mono text-xs text-muted-foreground">{submissionId}</p>
						<p className="mt-0.5 text-sm font-medium line-clamp-2">{ideaTitle}</p>
						<div className="mt-2 flex gap-2">
							<span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
								{categoryName}
							</span>
							{impactArea && (
								<span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
									{IMPACT_AREAS[impactArea as keyof typeof IMPACT_AREAS] ?? impactArea}
								</span>
							)}
						</div>
					</div>

					{/* Reassign target */}
					{pendingReassign && (
						<div className="flex items-center gap-3 rounded-lg border p-3">
							<Avatar className="size-10">
								{pendingReassign.photoUrl && (
									<AvatarImage src={pendingReassign.photoUrl} alt={pendingReassign.displayName} />
								)}
								<AvatarFallback className="text-xs">
									{pendingReassign.displayName
										.split(" ")
										.map((n) => n[0])
										.join("")
										.slice(0, 2)}
								</AvatarFallback>
							</Avatar>
							<div>
								<p className="text-sm font-medium">{pendingReassign.displayName}</p>
								{pendingReassign.jobTitle && (
									<p className="text-xs text-muted-foreground">{pendingReassign.jobTitle}</p>
								)}
								{pendingReassign.department && (
									<p className="text-xs text-muted-foreground">{pendingReassign.department}</p>
								)}
							</div>
						</div>
					)}

					{/* Reason + note (reassignment only) */}
					{assignedOwnerId && (
						<div className="space-y-3">
							<div className="space-y-1.5">
								<Label htmlFor="reassign-reason">
									Reason <span className="text-red-600">*</span>
								</Label>
								<Select
									value={reassignReason}
									onValueChange={(v) => setReassignReason(v as ReassignmentReason)}
								>
									<SelectTrigger id="reassign-reason">
										<SelectValue placeholder="Select a reason" />
									</SelectTrigger>
									<SelectContent>
										{Object.entries(REASSIGNMENT_REASONS).map(([key, label]) => (
											<SelectItem key={key} value={key}>
												{label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="reassign-note">
									Note <span className="text-xs font-normal text-muted-foreground">(optional)</span>
								</Label>
								<Textarea
									id="reassign-note"
									placeholder="Short context for the new owner..."
									value={reassignNote}
									onChange={(e) => setReassignNote(e.target.value)}
									rows={3}
									maxLength={500}
								/>
							</div>
						</div>
					)}

					<AlertDialogDescription>
						{assignedOwnerId
							? userRole === "admin"
								? "This will send a notification email and reset SLA timers. Status will roll back to New."
								: "This will send a notification email, reset SLA timers (status rolls back to New), and you will lose access to this idea."
							: "This will send a notification email and start SLA timers."}
					</AlertDialogDescription>

					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={!!assignedOwnerId && !reassignReason}
							onClick={async () => {
								if (!pendingReassign) return;
								await onReassign({
									newOwnerId: pendingReassign.id,
									reason: assignedOwnerId ? reassignReason || undefined : undefined,
									note: assignedOwnerId && reassignNote.trim() ? reassignNote.trim() : undefined,
								});
								setPendingReassign(null);
								if (userRole !== "admin") {
									onReassignComplete?.();
								}
							}}
						>
							{assignedOwnerId ? "Reassign" : "Assign"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
