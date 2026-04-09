import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "#/components/dashboard/status-badge";
import { ActivityTimeline } from "#/components/ideas/activity-timeline";
import { LeaderActions } from "#/components/ideas/leader-actions";
import { MessageThread } from "#/components/ideas/message-thread";
import { PeopleCard } from "#/components/ideas/people-card";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { IMPACT_AREAS } from "#/lib/constants";
import type { IdeaStatus } from "#/lib/constants";
import {
	getIdeaDetail,
	getLeadersForReassign,
	reassignIdea,
	updateIdea,
} from "#/server/functions/ideas";
import { addMessage, getIdeaMessages } from "#/server/functions/messages";

export const Route = createFileRoute("/ideas/$submissionId")({
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
		<main className="flex-1 p-6">
			{/* Header */}
			<div className="mb-6">
				<Link
					to="/dashboard"
					className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="size-3.5" />
					Back to Dashboard
				</Link>
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
							<div className="flex flex-wrap gap-4 text-sm">
								<div>
									<span className="text-muted-foreground">Category: </span>
									<span className="font-medium">{idea.categoryName}</span>
								</div>
								{idea.impactArea && (
									<div>
										<span className="text-muted-foreground">Impact: </span>
										<Badge variant="outline">
											{IMPACT_AREAS[idea.impactArea as keyof typeof IMPACT_AREAS] ??
												idea.impactArea}
										</Badge>
									</div>
								)}
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

					{/* Submitter card */}
					<PeopleCard person={idea.submitter} title="Submitter" submittedAt={idea.submittedAt} />

					{/* Activity & Messages tabs */}
					<Card>
						<Tabs defaultValue="activity">
							<CardHeader className="pb-0">
								<TabsList>
									<TabsTrigger value="activity">Activity</TabsTrigger>
									<TabsTrigger value="messages">
										Messages
										{messages.length > 0 && (
											<Badge variant="secondary" className="ml-1.5">
												{messages.length}
											</Badge>
										)}
									</TabsTrigger>
								</TabsList>
							</CardHeader>
							<CardContent className="pt-4">
								<TabsContent value="activity" className="mt-0">
									<ActivityTimeline events={idea.events} />
								</TabsContent>
								<TabsContent value="messages" className="mt-0">
									<MessageThread
										messages={messages}
										currentUserId={user.id}
										onSend={async (content) => {
											await messageMutation.mutateAsync(content);
										}}
										isSending={messageMutation.isPending}
									/>
								</TabsContent>
							</CardContent>
						</Tabs>
					</Card>
				</div>

				{/* Right column - Leader actions (only if can edit) */}
				{idea.canEdit && (
					<div className="lg:sticky lg:top-6 lg:self-start">
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
					</div>
				)}

				{/* Right column - Read-only status for submitters */}
				{!idea.canEdit && (
					<div className="lg:sticky lg:top-6 lg:self-start">
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
										<span className="text-sm font-medium">{idea.assignedLeader.displayName}</span>
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
					</div>
				)}
			</div>
		</main>
	);
}
