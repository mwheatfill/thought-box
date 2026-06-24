import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, Eye, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DirectoryPicker, type DirectoryResult } from "#/components/categories/directory-picker";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { initials } from "#/lib/utils";
import {
	addWatcher,
	getIdeaWatchers,
	removeWatcher,
	unwatchIdea,
	watchIdea,
} from "#/server/functions/watchers";

const EXPLICIT_LABEL: Record<string, string> = {
	self: "Watching",
	owner_added: "Added as watcher",
};

export function WatchersCard({ ideaId }: { ideaId: string }) {
	const queryClient = useQueryClient();
	const [showAdd, setShowAdd] = useState(false);
	const key = ["idea-watchers", ideaId];

	const { data } = useQuery({
		queryKey: key,
		queryFn: () => getIdeaWatchers({ data: { ideaId } }),
	});

	const watchFn = useServerFn(watchIdea);
	const unwatchFn = useServerFn(unwatchIdea);
	const addFn = useServerFn(addWatcher);
	const removeFn = useServerFn(removeWatcher);
	const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

	const toggleMutation = useMutation({
		mutationFn: async (watching: boolean) => {
			if (watching) await unwatchFn({ data: { ideaId } });
			else await watchFn({ data: { ideaId } });
		},
		onSuccess: invalidate,
		onError: () => toast.error("Couldn't update your watch setting"),
	});

	const addMutation = useMutation({
		mutationFn: (u: DirectoryResult) =>
			addFn({
				data: {
					ideaId,
					entraId: u.entraId,
					displayName: u.displayName,
					email: u.email,
					jobTitle: u.jobTitle,
					department: u.department,
					officeLocation: u.officeLocation,
				},
			}),
		onSuccess: (r) => {
			toast.success(`${r.displayName} is now watching`);
			setShowAdd(false);
			invalidate();
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add watcher"),
	});

	const removeMutation = useMutation({
		mutationFn: (userId: string) => removeFn({ data: { ideaId, userId } }),
		onSuccess: invalidate,
		onError: () => toast.error("Couldn't remove watcher"),
	});

	if (!data) return null;
	const isImplicit = data.myFollow === "reviewer" || data.myFollow === "submitter";
	// Nothing to surface to a viewer who's neither following nor able to manage.
	if (!isImplicit && !data.canWatch && !data.canManage) return null;

	const followAs = data.myFollow === "reviewer" ? "the reviewer" : "the submitter";

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
				<CardTitle className="flex items-center gap-2 text-sm font-medium">
					<Eye className="size-4" /> Watchers
				</CardTitle>
				{isImplicit ? (
					<span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
						<Bell className="size-3.5" /> Following
					</span>
				) : (
					data.canWatch && (
						<Button
							variant={data.myFollow === "watching" ? "secondary" : "outline"}
							size="sm"
							disabled={toggleMutation.isPending}
							onClick={() => toggleMutation.mutate(data.myFollow === "watching")}
						>
							{data.myFollow === "watching" ? (
								<>
									<BellOff className="mr-1.5 size-3.5" /> Unwatch
								</>
							) : (
								<>
									<Bell className="mr-1.5 size-3.5" /> Watch
								</>
							)}
						</Button>
					)
				)}
			</CardHeader>

			<CardContent className="space-y-3">
				{/* Implicit followers get a reassurance, not a toggle. */}
				{isImplicit && (
					<p className="text-sm text-muted-foreground">
						You're automatically notified of replies and status changes because you're {followAs}
						{data.canManage ? "." : " — no need to watch."}
					</p>
				)}

				{data.canManage && (
					<>
						{data.autoFollowers.length > 0 && (
							<div className="space-y-1">
								<p className="text-xs font-semibold uppercase text-muted-foreground">
									Following automatically
								</p>
								{data.autoFollowers.map((f) => (
									<Person
										key={`${f.id}-${f.kind}`}
										name={f.displayName}
										photoUrl={f.photoUrl}
										sub={f.kind === "reviewer" ? "Active reviewer" : "Submitter"}
									/>
								))}
							</div>
						)}

						<div className="space-y-1">
							<p className="text-xs font-semibold uppercase text-muted-foreground">
								Watchers ({data.watchers.length})
							</p>
							{data.watchers.length === 0 ? (
								<p className="text-sm text-muted-foreground">No extra watchers.</p>
							) : (
								data.watchers.map((w) => (
									<Person
										key={w.id}
										name={w.displayName}
										photoUrl={w.photoUrl}
										sub={EXPLICIT_LABEL[w.source] ?? "Watching"}
										action={
											<Button
												variant="ghost"
												size="icon"
												className="size-7"
												disabled={removeMutation.isPending}
												onClick={() => removeMutation.mutate(w.id)}
												title="Remove watcher"
											>
												<UserMinus className="size-4" />
											</Button>
										}
									/>
								))
							)}
						</div>

						{showAdd ? (
							<DirectoryPicker
								placeholder="Add a stakeholder to watch…"
								onSelect={(u) => addMutation.mutate(u)}
							/>
						) : (
							<button
								type="button"
								onClick={() => setShowAdd(true)}
								className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
							>
								<UserPlus className="size-3.5" /> Add a watcher
							</button>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}

function Person({
	name,
	photoUrl,
	sub,
	action,
}: {
	name: string;
	photoUrl: string | null;
	sub: string;
	action?: React.ReactNode;
}) {
	return (
		<div className="flex items-center gap-2.5 rounded-md px-1 py-1">
			<Avatar className="size-7">
				{photoUrl && <AvatarImage src={photoUrl} alt={name} />}
				<AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{name}</p>
				<p className="truncate text-xs text-muted-foreground">{sub}</p>
			</div>
			{action}
		</div>
	);
}
