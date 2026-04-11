import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "#/components/dashboard/status-badge";
import { ActivityTimeline } from "#/components/ideas/activity-timeline";
import { LeaderActions } from "#/components/ideas/leader-actions";
import { MessageThread } from "#/components/ideas/message-thread";
import { PageTransition } from "#/components/ui/animated";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { DropZone } from "#/components/ui/drop-zone";
import { RouteError } from "#/components/ui/route-error";
import { Separator } from "#/components/ui/separator";
import { UserCardPopover } from "#/components/ui/user-card";
import { IMPACT_AREAS } from "#/lib/constants";
import type { IdeaStatus } from "#/lib/constants";
import { getIdeaAttachments } from "#/server/functions/attachments";
import {
	getIdeaDetail,
	getLeadersForReassign,
	reassignIdea,
	updateIdea,
} from "#/server/functions/ideas";
import { addMessage, getIdeaMessages } from "#/server/functions/messages";

export const Route = createFileRoute("/ideas/$submissionId")({
	errorComponent: ({ error }) => <RouteError error={error} variant="not-found" />,
	loader: async ({ params }) => {
		const [idea, leaders] = await Promise.all([
			getIdeaDetail({ data: { submissionId: params.submissionId } }),
			getLeadersForReassign().catch(() => []),
		]);
		return { idea, leaders };
	},
	component: IdeaDetailPage,
});

function IdeaDetailPage() {
	const { submissionId } = Route.useParams();
	const { idea: initialIdea, leaders } = Route.useLoaderData();
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

	const lockedStatuses = ["accepted", "implemented", "declined"];
	const isLocked = lockedStatuses.includes(idea.status) && !idea.canEdit;

	// Update mutation
	const updateFn = useServerFn(updateIdea);
	const updateMutation = useMutation({
		mutationFn: (updates: Record<string, unknown>) =>
			updateFn({ data: { ideaId: idea.id, ...updates } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["idea", submissionId] });
			toast.success("Changes saved");
		},
		onError: () => {
			toast.error("Failed to save changes");
		},
	});

	// Reassign mutation
	const reassignFn = useServerFn(reassignIdea);
	const reassignMutation = useMutation({
		mutationFn: (newLeaderId: string) => reassignFn({ data: { ideaId: idea.id, newLeaderId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["idea", submissionId] });
			toast.success("Idea reassigned");
		},
		onError: () => {
			toast.error("Failed to reassign");
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
											<p className="mb-1 text-xs font-medium text-muted-foreground">
												Expected Benefit
											</p>
											<p className="text-sm">{idea.expectedBenefit}</p>
										</div>
									</>
								)}

								<Separator />
								<div className="flex flex-wrap items-center gap-2">
									<UserCardPopover userId={idea.submitter.id}>
										<button
											type="button"
											className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
										>
											<Avatar className="size-4">
												{idea.submitter.photoUrl && (
													<AvatarImage
														src={idea.submitter.photoUrl}
														alt={idea.submitter.displayName}
													/>
												)}
												<AvatarFallback className="text-[8px]">
													{idea.submitter.displayName
														.split(" ")
														.map((n: string) => n[0])
														.join("")
														.slice(0, 2)}
												</AvatarFallback>
											</Avatar>
											{idea.submitter.displayName}
										</button>
									</UserCardPopover>
									<span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
										{idea.categoryName}
									</span>
									{idea.impactArea && (
										<span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
											{IMPACT_AREAS[idea.impactArea as keyof typeof IMPACT_AREAS] ??
												idea.impactArea}
										</span>
									)}
									<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
										{new Date(idea.submittedAt).toLocaleDateString("en-US", {
											month: "short",
											day: "numeric",
											year: "numeric",
										})}
									</span>
								</div>

								{/* Leader notes (read-only for submitters) */}
								{idea.leaderNotes && !idea.canEdit && (
									<>
										<Separator />
										<div>
											<p className="mb-1 text-xs font-medium text-muted-foreground">Leader Notes</p>
											<p className="text-sm">{idea.leaderNotes}</p>
										</div>
									</>
								)}
							</CardContent>
						</Card>

						{/* Messages */}
						<Card>
							<CardHeader>
								<CardTitle className="text-sm font-medium">
									Messages
									{messages.length > 0 && (
										<Badge variant="secondary" className="ml-1.5">
											{messages.length}
										</Badge>
									)}
								</CardTitle>
							</CardHeader>
							<CardContent>
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
								/>
							</CardContent>
						</Card>

						{/* Attachments (compact) */}
						<Card>
							<CardHeader className="pb-2">
								<CardTitle className="text-sm font-medium text-muted-foreground">
									Attachments
									{ideaAttachments.length > 0 && (
										<span className="ml-1.5 text-xs font-normal">({ideaAttachments.length})</span>
									)}
								</CardTitle>
							</CardHeader>
							<CardContent>
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
							</CardContent>
						</Card>
					</div>

					{/* Right column */}
					{idea.canEdit && (
						<div className="space-y-6">
							<LeaderActions
								ideaId={idea.id}
								currentStatus={idea.status}
								currentRejectionReason={idea.rejectionReason}
								currentLeaderNotes={idea.leaderNotes}
								currentActionTaken={idea.actionTaken}
								slaStatus={idea.slaStatus}
								slaDaysRemaining={idea.slaDaysRemaining}
								slaDueDate={idea.slaDueDate}
								closureSlaDueDate={idea.closureSlaDueDate}
								closureSlaDaysRemaining={idea.closureSlaDaysRemaining}
								assignedLeaderName={idea.assignedLeader?.displayName ?? null}
								assignedLeaderId={idea.assignedLeader?.id ?? null}
								leaders={leaders}
								onSave={async (updates) => {
									await updateMutation.mutateAsync(updates);
								}}
								onReassign={async (newLeaderId) => {
									await reassignMutation.mutateAsync(newLeaderId);
								}}
								onCommunicate={async (message) => {
									await messageMutation.mutateAsync(message);
								}}
								isSaving={updateMutation.isPending}
								isReassigning={reassignMutation.isPending}
								isCommunicating={messageMutation.isPending}
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
							<Card>
								<CardHeader className="pb-3">
									<CardTitle className="text-sm font-medium">Status & Assignment</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3">
									<div className="flex items-center justify-between">
										<span className="text-sm text-muted-foreground">Status</span>
										<StatusBadge status={idea.status as IdeaStatus} />
									</div>
									{idea.assignedLeader && (
										<div className="flex items-center justify-between">
											<span className="text-sm text-muted-foreground">Reviewer</span>
											<UserCardPopover userId={idea.assignedLeader.id}>
												<button
													type="button"
													className="text-sm font-medium hover:text-primary hover:underline"
												>
													{idea.assignedLeader.displayName}
												</button>
											</UserCardPopover>
										</div>
									)}
									{idea.rejectionReason && (
										<div>
											<span className="text-sm text-muted-foreground">Reason: </span>
											<span className="text-sm">{idea.rejectionReason.replace(/_/g, " ")}</span>
										</div>
									)}
								</CardContent>
							</Card>

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
