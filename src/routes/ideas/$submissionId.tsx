import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Eye, Lock, MessagesSquare, NotebookPen, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { DualSlaProgress } from "#/components/dashboard/sla-progress";
import { StatusBadge } from "#/components/dashboard/status-badge";
import { ActivityTimeline } from "#/components/ideas/activity-timeline";
import { ClosedIdeaPanel } from "#/components/ideas/closed-idea-panel";
import { AudienceBanner, MessageThread } from "#/components/ideas/message-thread";
import { OwnerActions } from "#/components/ideas/owner-actions";
import { PageTransition } from "#/components/ui/animated";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { DropZone } from "#/components/ui/drop-zone";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty";
import { RouteError } from "#/components/ui/route-error";
import { Separator } from "#/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { UserCardPopover } from "#/components/ui/user-card";
import { IMPACT_AREAS, isLockedStatus } from "#/lib/constants";
import type { IdeaStatus, LockedStatus } from "#/lib/constants";
import { initials } from "#/lib/utils";
import { getIdeaAttachments } from "#/server/functions/attachments";
import {
	getActiveOwnersAndAdmins,
	getIdeaDetail,
	reassignIdea,
	updateIdea,
} from "#/server/functions/ideas";
import { addInternalNote, getIdeaInternalNotes } from "#/server/functions/internal-notes";
import { addMessage, getIdeaMessages } from "#/server/functions/messages";

export const Route = createFileRoute("/ideas/$submissionId")({
	errorComponent: ({ error }) => <RouteError error={error} variant="not-found" />,
	loader: async ({ params }) => {
		const owners = getActiveOwnersAndAdmins().catch(() => []);
		try {
			const idea = await getIdeaDetail({ data: { submissionId: params.submissionId } });
			return { idea, owners: await owners };
		} catch {
			// Retry once — DB write may still be committing after chat submission
			await new Promise((r) => setTimeout(r, 500));
			const idea = await getIdeaDetail({ data: { submissionId: params.submissionId } });
			return { idea, owners: await owners };
		}
	},
	component: IdeaDetailPage,
});

function IdeaDetailPage() {
	const { submissionId } = Route.useParams();
	const { idea: initialIdea, owners } = Route.useLoaderData();
	const { user } = Route.useRouteContext();
	const queryClient = useQueryClient();

	// Keep data fresh with TanStack Query
	const { data: idea } = useQuery({
		queryKey: ["idea", submissionId],
		queryFn: () => getIdeaDetail({ data: { submissionId } }),
		initialData: initialIdea,
	});

	// Messages query
	const { data: messages = [] } = useQuery({
		queryKey: ["idea-messages", idea.id],
		queryFn: () => getIdeaMessages({ data: { ideaId: idea.id } }),
	});

	// Attachments query
	const { data: ideaAttachments = [] } = useQuery({
		queryKey: ["idea-attachments", idea.id],
		queryFn: () => getIdeaAttachments({ data: { ideaId: idea.id } }),
	});

	const canSeeInternalNotes = user.role === "owner" || user.role === "admin";

	const { data: internalNotes = [] } = useQuery({
		queryKey: ["idea-internal-notes", idea.id],
		queryFn: () => getIdeaInternalNotes({ data: { ideaId: idea.id } }),
		enabled: canSeeInternalNotes,
	});

	const isLocked = isLockedStatus(idea.status) && !idea.canEdit;

	// Update mutation
	const updateFn = useServerFn(updateIdea);
	const updateMutation = useMutation({
		mutationFn: (updates: Record<string, unknown>) =>
			updateFn({ data: { ideaId: idea.id, ...updates } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["idea", submissionId] });
			toast.success("Changes saved");
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to save changes");
		},
	});

	// Reassign mutation
	const reassignFn = useServerFn(reassignIdea);
	const reassignMutation = useMutation({
		mutationFn: (input: Parameters<typeof reassignFn>[0]["data"]) => reassignFn({ data: input }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["idea", submissionId] });
			toast.success("Idea reassigned");
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to reassign");
		},
	});

	// Message mutation
	const messageFn = useServerFn(addMessage);
	const messageMutation = useMutation({
		mutationFn: (content: string) => messageFn({ data: { ideaId: idea.id, content } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["idea-messages", idea.id] });
			queryClient.invalidateQueries({ queryKey: ["idea", submissionId] });
		},
		onError: () => {
			toast.error("Failed to send message");
		},
	});

	const internalNoteFn = useServerFn(addInternalNote);
	const internalNoteMutation = useMutation({
		mutationFn: (input: { content: string; mentions?: string[] }) =>
			internalNoteFn({ data: { ideaId: idea.id, ...input } }),
		onSuccess: () => {
			// Only the internal-notes thread changes. The idea aggregate does not
			// track a notes count or any field affected by note insertion, so we
			// skip the broader ["idea", submissionId] invalidation here — that
			// avoids a redundant refetch when the inline-note path chains this
			// mutation right after updateMutation (which already invalidated it).
			queryClient.invalidateQueries({ queryKey: ["idea-internal-notes", idea.id] });
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to save note");
		},
	});

	const submitterFirstName = idea.submitter.displayName.split(" ")[0];

	// Submitters only see the Messages tab, so they don't need a banner
	// (no other thread to confuse it with). Owners/admins get both.
	const messagesAudience = canSeeInternalNotes ? (
		<AudienceBanner
			tone="visible"
			icon={<Eye className="size-3.5 shrink-0" />}
			avatar={{
				displayName: idea.submitter.displayName,
				photoUrl: idea.submitter.photoUrl,
			}}
			label={
				<>
					Visible to <span className="font-medium">{idea.submitter.displayName}</span>
				</>
			}
		/>
	) : undefined;

	const internalNotesAudience = (
		<AudienceBanner
			tone="private"
			icon={<Lock className="size-3.5 shrink-0" />}
			label="Private — owners & admins only"
		/>
	);

	const messagesEmpty = (
		<Empty>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<MessagesSquare />
				</EmptyMedia>
				<EmptyTitle>Start the conversation</EmptyTitle>
				<EmptyDescription>
					{canSeeInternalNotes
						? `Ask ${submitterFirstName} a clarifying question or share an update — they'll get an email.`
						: "Reply with more context for your reviewer or ask a question — you'll both get notified of new messages."}
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);

	const internalNotesEmpty = (
		<Empty>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<NotebookPen />
				</EmptyMedia>
				<EmptyTitle>No internal notes yet</EmptyTitle>
				<EmptyDescription>
					Capture research, context, or decisions for the team. Submitters never see this thread.
					Type <span className="font-medium">@</span> to tag another owner and notify them by email.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);

	return (
		<PageTransition>
			<main className="flex-1 bg-background p-6">
				{/* Header */}
				<div className="mb-6">
					<button
						type="button"
						onClick={() => {
							if (window.history.length > 1) {
								window.history.back();
							} else {
								window.location.href = "/dashboard";
							}
						}}
						className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
					>
						<ArrowLeft className="size-3.5" />
						Back
					</button>
					<div className="flex items-start justify-between gap-4">
						<div>
							<div className="flex items-center gap-2">
								<span className="font-mono text-sm text-muted-foreground">{idea.submissionId}</span>
								<StatusBadge status={idea.status as IdeaStatus} />
							</div>
							<h1 className="mt-1 text-2xl font-bold tracking-tight">{idea.title}</h1>
						</div>
					</div>
				</div>

				{/* Two-column layout */}
				<div className="grid gap-6 lg:grid-cols-[1fr_320px]">
					{/* Left column */}
					<div className="space-y-6">
						{/* Idea description */}
						<Card>
							<CardHeader>
								<CardTitle className="text-sm font-medium text-muted-foreground">Idea</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<p className="whitespace-pre-wrap text-sm leading-relaxed">{idea.description}</p>

								{idea.expectedBenefit && (
									<>
										<Separator />
										<div>
											<p className="mb-1 text-sm font-medium text-muted-foreground">
												Expected Benefit
											</p>
											<p className="text-sm">{idea.expectedBenefit}</p>
										</div>
									</>
								)}

								<Separator />
								<div className="flex items-center gap-3 text-sm">
									<Avatar className="size-7">
										{idea.submitter.photoUrl && (
											<AvatarImage src={idea.submitter.photoUrl} alt={idea.submitter.displayName} />
										)}
										<AvatarFallback className="text-[10px]">
											{initials(idea.submitter.displayName)}
										</AvatarFallback>
									</Avatar>
									<div>
										<UserCardPopover userId={idea.submitter.id}>
											<button
												type="button"
												className="font-medium hover:text-primary hover:underline"
											>
												{idea.submitter.displayName}
											</button>
										</UserCardPopover>
										<span className="text-muted-foreground">
											{" "}
											submitted{" "}
											{new Date(idea.submittedAt).toLocaleDateString("en-US", {
												month: "short",
												day: "numeric",
												year: "numeric",
											})}
										</span>
									</div>
								</div>

								<Separator />
								<div className="flex flex-wrap gap-2 text-sm">
									<div>
										<span className="text-muted-foreground">Category: </span>
										<span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
											{idea.categoryName}
										</span>
									</div>
									{idea.impactArea && (
										<div>
											<span className="text-muted-foreground">Impact: </span>
											<span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
												{IMPACT_AREAS[idea.impactArea as keyof typeof IMPACT_AREAS] ??
													idea.impactArea}
											</span>
										</div>
									)}
								</div>

								{/* Message from reviewer (read-only for submitters) */}
								{idea.messageToSubmitter && !idea.canEdit && (
									<>
										<Separator />
										<div>
											<p className="mb-1 text-xs font-medium text-muted-foreground">
												Message from reviewer
											</p>
											<p className="text-sm">{idea.messageToSubmitter}</p>
										</div>
									</>
								)}
							</CardContent>
						</Card>

						{/* Messages & Attachments */}
						<Card>
							<Tabs defaultValue="messages">
								<CardHeader className="pb-0">
									<TabsList>
										<TabsTrigger value="messages">
											Messages
											{messages.length > 0 && (
												<Badge variant="secondary" className="ml-1.5">
													{messages.length}
												</Badge>
											)}
										</TabsTrigger>
										{canSeeInternalNotes && (
											<TabsTrigger value="internal-notes" className="gap-1">
												<Lock className="size-3.5" />
												Internal Notes
												{internalNotes.length > 0 && (
													<Badge variant="secondary">{internalNotes.length}</Badge>
												)}
											</TabsTrigger>
										)}
										<TabsTrigger value="attachments" className="gap-1">
											<Paperclip className="size-3.5" />
											{ideaAttachments.length > 0 && (
												<Badge variant="secondary">{ideaAttachments.length}</Badge>
											)}
										</TabsTrigger>
									</TabsList>
								</CardHeader>
								<CardContent className="pt-4">
									<TabsContent value="messages" className="mt-0">
										<MessageThread
											messages={messages}
											currentUserId={user.id}
											ideaId={idea.id}
											onSend={async (content) => {
												return await messageMutation.mutateAsync(content);
											}}
											onAttachmentUpload={() => {
												queryClient.invalidateQueries({
													queryKey: ["idea-attachments", idea.id],
												});
											}}
											isSending={messageMutation.isPending}
											audience={messagesAudience}
											emptyMessage={messagesEmpty}
											sendLabel={canSeeInternalNotes ? `Send to ${submitterFirstName}` : undefined}
										/>
									</TabsContent>
									{canSeeInternalNotes && (
										<TabsContent value="internal-notes" className="mt-0">
											<MessageThread
												messages={internalNotes}
												currentUserId={user.id}
												ideaId={idea.id}
												onSend={async (content, mentions) => {
													return await internalNoteMutation.mutateAsync({ content, mentions });
												}}
												onAttachmentUpload={() => {
													queryClient.invalidateQueries({
														queryKey: ["idea-attachments", idea.id],
													});
												}}
												isSending={internalNoteMutation.isPending}
												mentionable={owners}
												placeholder="Internal note — use @ to mention an owner"
												emptyMessage={internalNotesEmpty}
												variant="notes"
												audience={internalNotesAudience}
												sendLabel="Save note"
												sendIcon={<NotebookPen className="size-4" />}
											/>
										</TabsContent>
									)}
									<TabsContent value="attachments" className="mt-0">
										<DropZone
											ideaId={idea.id}
											userId={user.id}
											readOnly={isLocked}
											existingFiles={ideaAttachments}
											onUpload={() => {
												queryClient.invalidateQueries({
													queryKey: ["idea-attachments", idea.id],
												});
												queryClient.invalidateQueries({
													queryKey: ["idea", submissionId],
												});
											}}
											onDelete={() => {
												queryClient.invalidateQueries({
													queryKey: ["idea-attachments", idea.id],
												});
												queryClient.invalidateQueries({
													queryKey: ["idea", submissionId],
												});
											}}
										/>
									</TabsContent>
								</CardContent>
							</Tabs>
						</Card>
					</div>

					{/* Right column */}
					{idea.canEdit && (
						<div className="space-y-6">
							<OwnerActions
								// Remount on status/owner change to resync local form state.
								key={`${idea.status}-${idea.assignedOwner?.id ?? "none"}`}
								submissionId={idea.submissionId}
								ideaTitle={idea.title}
								categoryName={idea.categoryName}
								impactArea={idea.impactArea}
								userRole={user.role}
								currentStatus={idea.status}
								currentDeclineReason={idea.declineReason}
								currentMessageToSubmitter={idea.messageToSubmitter}
								slaStatus={idea.slaStatus}
								slaDaysRemaining={idea.slaDaysRemaining}
								slaDueDate={idea.slaDueDate}
								closureSlaDueDate={idea.closureSlaDueDate}
								closureSlaDaysRemaining={idea.closureSlaDaysRemaining}
								submittedAt={idea.submittedAt}
								closedAt={idea.closedAt}
								assignedOwnerName={idea.assignedOwner?.displayName ?? null}
								assignedOwnerId={idea.assignedOwner?.id ?? null}
								assignedOwnerPhotoUrl={idea.assignedOwner?.photoUrl ?? null}
								owners={owners}
								onSave={async (updates) => {
									const { internalNote, internalNoteMentions, ...statusUpdates } = updates;
									await updateMutation.mutateAsync(statusUpdates);
									if (internalNote) {
										// Fire-and-forget: the status save already succeeded; a failed
										// note shouldn't roll back the status change.
										internalNoteMutation.mutate({
											content: internalNote,
											mentions: internalNoteMentions,
										});
									}
								}}
								onReassign={async ({ newOwnerId, reason, note }) => {
									await reassignMutation.mutateAsync({
										ideaId: idea.id,
										newOwnerId,
										reason,
										note,
									});
								}}
								onReassignComplete={() => {
									window.history.back();
								}}
								isSaving={updateMutation.isPending}
								isReassigning={reassignMutation.isPending}
							/>

							{/* Activity */}
							<Card>
								<CardHeader className="pb-3">
									<CardTitle className="text-sm font-medium">Activity</CardTitle>
								</CardHeader>
								<CardContent>
									<ActivityTimeline events={idea.events} />
								</CardContent>
							</Card>
						</div>
					)}

					{/* Right column - Read-only for submitters */}
					{!idea.canEdit && (
						<div className="space-y-6">
							{isLocked ? (
								<ClosedIdeaPanel
									status={idea.status as LockedStatus}
									declineReason={idea.declineReason}
									closedAt={idea.closedAt}
									submittedAt={idea.submittedAt}
									assignedOwner={
										idea.assignedOwner
											? {
													id: idea.assignedOwner.id,
													displayName: idea.assignedOwner.displayName,
													photoUrl: idea.assignedOwner.photoUrl ?? null,
												}
											: null
									}
								/>
							) : (
								<Card>
									<CardHeader className="pb-3">
										<CardTitle className="text-sm font-medium">SLA</CardTitle>
									</CardHeader>
									<CardContent className="space-y-4">
										<DualSlaProgress
											reviewSlaDaysRemaining={idea.slaDaysRemaining}
											reviewSlaDueDate={idea.slaDueDate}
											closureSlaDaysRemaining={idea.closureSlaDaysRemaining}
											closureSlaDueDate={idea.closureSlaDueDate}
										/>
										{idea.assignedOwner && (
											<div className="flex items-center justify-between">
												<span className="text-sm text-muted-foreground">Reviewer</span>
												<UserCardPopover userId={idea.assignedOwner.id}>
													<button
														type="button"
														className="text-sm font-medium hover:text-primary hover:underline"
													>
														{idea.assignedOwner.displayName}
													</button>
												</UserCardPopover>
											</div>
										)}
									</CardContent>
								</Card>
							)}

							{/* Activity */}
							<Card>
								<CardHeader className="pb-3">
									<CardTitle className="text-sm font-medium">Activity</CardTitle>
								</CardHeader>
								<CardContent>
									<ActivityTimeline events={idea.events} />
								</CardContent>
							</Card>
						</div>
					)}
				</div>
			</main>
		</PageTransition>
	);
}
