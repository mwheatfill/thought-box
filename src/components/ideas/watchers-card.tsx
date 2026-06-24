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

const SOURCE_LABEL: Record<string, string> = {
	self: "Following",
	owner_added: "Added",
	assignment: "Assigned",
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
	// Nothing to show a pure submitter (implicitly watching, can't manage).
	if (!data.canWatch && !data.canManage) return null;

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
				<CardTitle className="flex items-center gap-2 text-sm font-medium">
					<Eye className="size-4" /> Watchers
				</CardTitle>
				{data.canWatch && (
					<Button
						variant={data.isWatching ? "secondary" : "outline"}
						size="sm"
						disabled={toggleMutation.isPending}
						onClick={() => toggleMutation.mutate(data.isWatching)}
					>
						{data.isWatching ? (
							<>
								<BellOff className="mr-1.5 size-3.5" /> Unwatch
							</>
						) : (
							<>
								<Bell className="mr-1.5 size-3.5" /> Watch
							</>
						)}
					</Button>
				)}
			</CardHeader>

			{data.canManage && (
				<CardContent className="space-y-3">
					{data.watchers.length === 0 ? (
						<p className="text-sm text-muted-foreground">No one is watching yet.</p>
					) : (
						<ul className="space-y-1">
							{data.watchers.map((w) => (
								<li key={w.id} className="flex items-center gap-2.5 rounded-md px-1 py-1">
									<Avatar className="size-7">
										{w.photoUrl && <AvatarImage src={w.photoUrl} alt={w.displayName} />}
										<AvatarFallback className="text-[10px]">
											{initials(w.displayName)}
										</AvatarFallback>
									</Avatar>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">{w.displayName}</p>
										<p className="truncate text-xs text-muted-foreground">
											{SOURCE_LABEL[w.source] ?? w.source}
										</p>
									</div>
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
								</li>
							))}
						</ul>
					)}

					{showAdd ? (
						<DirectoryPicker
							placeholder="Add someone to watch…"
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
				</CardContent>
			)}
		</Card>
	);
}
