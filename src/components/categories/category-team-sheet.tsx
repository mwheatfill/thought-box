import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Crown, Loader2, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DirectoryPicker, type DirectoryResult } from "#/components/categories/directory-picker";
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
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "#/components/ui/sheet";
import { initials } from "#/lib/utils";
import {
	addRosterContributorFromDirectory,
	getCategoryTeam,
	removeRosterContributor,
	transferCategoryOwnership,
} from "#/server/functions/category-team";

export function CategoryTeamSheet({
	categoryId,
	open,
	onOpenChange,
	onChanged,
}: {
	categoryId: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onChanged: () => void;
}) {
	const queryClient = useQueryClient();
	const [pendingTransfer, setPendingTransfer] = useState<DirectoryResult | null>(null);

	const teamQuery = useQuery({
		queryKey: ["category-team", categoryId],
		queryFn: () => getCategoryTeam({ data: { categoryId: categoryId as string } }),
		enabled: open && !!categoryId,
	});
	const team = teamQuery.data;

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["category-team", categoryId] });
		onChanged();
	};

	const addFn = useServerFn(addRosterContributorFromDirectory);
	const removeFn = useServerFn(removeRosterContributor);
	const transferFn = useServerFn(transferCategoryOwnership);

	const addMutation = useMutation({
		mutationFn: (u: DirectoryResult) =>
			addFn({
				data: {
					categoryId: categoryId as string,
					entraId: u.entraId,
					displayName: u.displayName,
					email: u.email,
					jobTitle: u.jobTitle,
					department: u.department,
					officeLocation: u.officeLocation,
				},
			}),
		onSuccess: (r) => {
			toast.success(`Added ${r.displayName} to the team`);
			invalidate();
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add watcher"),
	});

	const removeMutation = useMutation({
		mutationFn: (userId: string) =>
			removeFn({ data: { categoryId: categoryId as string, userId } }),
		onSuccess: () => {
			toast.success("Removed from the team");
			invalidate();
		},
		onError: () => toast.error("Couldn't remove watcher"),
	});

	const transferMutation = useMutation({
		mutationFn: (u: DirectoryResult) =>
			transferFn({
				data: {
					categoryId: categoryId as string,
					entraId: u.entraId,
					displayName: u.displayName,
					email: u.email,
					jobTitle: u.jobTitle,
					department: u.department,
					officeLocation: u.officeLocation,
				},
			}),
		onSuccess: (r) => {
			toast.success(`Ownership transferred to ${r.newOwnerName}`);
			setPendingTransfer(null);
			invalidate();
			onOpenChange(false);
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't transfer ownership"),
	});

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-full overflow-y-auto sm:max-w-md">
				<SheetHeader>
					<SheetTitle>{team?.name ?? "Manage team"}</SheetTitle>
					<SheetDescription>
						Manage who reviews ideas in this category. Owners hold accountability; watchers can add
						owner notes and message submitters.
					</SheetDescription>
				</SheetHeader>

				{teamQuery.isLoading || !team ? (
					<div className="flex items-center justify-center py-12 text-muted-foreground">
						<Loader2 className="size-5 animate-spin" />
					</div>
				) : (
					<div className="mt-4 space-y-6 px-4 pb-6">
						{/* Owner */}
						<section className="space-y-2">
							<h3 className="text-xs font-semibold uppercase text-muted-foreground">Owner</h3>
							{team.owner ? (
								<PersonRow
									name={team.owner.displayName}
									sub={team.owner.email}
									photoUrl={team.owner.photoUrl}
									badge={<Crown className="size-3.5 text-amber-500" />}
								/>
							) : (
								<p className="text-sm text-muted-foreground">Unowned</p>
							)}
						</section>

						{/* Watchers */}
						<section className="space-y-2">
							<h3 className="text-xs font-semibold uppercase text-muted-foreground">
								Watchers ({team.contributors.length})
							</h3>
							{team.contributors.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No watchers yet. Add a colleague to share the review work.
								</p>
							) : (
								<ul className="space-y-1">
									{team.contributors.map((c) => (
										<li key={c.id}>
											<PersonRow
												name={c.displayName}
												sub={[c.jobTitle, c.department].filter(Boolean).join(" · ") || c.email}
												photoUrl={c.photoUrl}
												action={
													<Button
														variant="ghost"
														size="icon"
														className="size-7"
														disabled={removeMutation.isPending}
														onClick={() => removeMutation.mutate(c.id)}
														title="Remove from team"
													>
														<UserMinus className="size-4" />
													</Button>
												}
											/>
										</li>
									))}
								</ul>
							)}
							<div className="pt-2">
								<p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
									<UserPlus className="size-3.5" /> Add a watcher
								</p>
								<DirectoryPicker
									placeholder="Search by name…"
									onSelect={(u) => addMutation.mutate(u)}
								/>
							</div>
						</section>

						{/* Transfer ownership */}
						<section className="space-y-2 border-t pt-4">
							<h3 className="text-xs font-semibold uppercase text-muted-foreground">
								Transfer ownership
							</h3>
							<p className="text-xs text-muted-foreground">
								Hand this category — and every idea in it — to a new owner.
							</p>
							<DirectoryPicker
								placeholder="Search for the new owner…"
								onSelect={(u) => setPendingTransfer(u)}
							/>
						</section>
					</div>
				)}
			</SheetContent>

			<AlertDialog open={!!pendingTransfer} onOpenChange={(o) => !o && setPendingTransfer(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Transfer ownership?</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingTransfer?.displayName} will become the owner of{" "}
							<span className="font-medium">{team?.name}</span> and every idea in it. You'll lose
							owner access unless you're an admin. This is audited.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={transferMutation.isPending}
							onClick={() => pendingTransfer && transferMutation.mutate(pendingTransfer)}
						>
							Transfer
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Sheet>
	);
}

function PersonRow({
	name,
	sub,
	photoUrl,
	badge,
	action,
}: {
	name: string;
	sub: string | null;
	photoUrl: string | null;
	badge?: React.ReactNode;
	action?: React.ReactNode;
}) {
	return (
		<div className="flex items-center gap-3 rounded-md border px-3 py-2">
			<Avatar className="size-8">
				{photoUrl && <AvatarImage src={photoUrl} alt={name} />}
				<AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<p className="flex items-center gap-1.5 truncate text-sm font-medium">
					{name} {badge}
				</p>
				{sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
			</div>
			{action}
		</div>
	);
}
