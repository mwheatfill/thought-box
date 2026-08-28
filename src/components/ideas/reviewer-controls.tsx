import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronsUpDown, FolderInput, Loader2, RotateCcw, Sparkles, UserCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DirectoryPicker, type DirectoryResult } from "#/components/categories/directory-picker";
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Label } from "#/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { REASSIGNMENT_REASONS, type ReassignmentReason } from "#/lib/constants";
import { suggestCategoryForIdea } from "#/server/functions/ai-suggest";
import {
	assignReviewer,
	changeIdeaCategory,
	getAssignableReviewers,
	getReassignableCategories,
	reopenIdea,
	requestTriage,
} from "#/server/functions/ideas";

interface ReviewerControlsProps {
	ideaId: string;
	categoryId: string;
	categoryName: string;
	assignedReviewerId: string | null;
	assignedReviewerName: string | null;
	onChanged: () => void;
}

export function ReviewerControls({
	ideaId,
	categoryId,
	categoryName,
	assignedReviewerId,
	assignedReviewerName,
	onChanged,
}: ReviewerControlsProps) {
	const queryClient = useQueryClient();
	const [assignOpen, setAssignOpen] = useState(false);
	const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

	const refresh = () => {
		onChanged();
		queryClient.invalidateQueries({ queryKey: ["assignable-reviewers", categoryId] });
	};

	// ── Assignment ──────────────────────────────────────────────────────────
	const { data: candidates = [] } = useQuery({
		queryKey: ["assignable-reviewers", categoryId],
		queryFn: () => getAssignableReviewers({ data: { categoryId } }),
		enabled: assignOpen,
	});
	const assignFn = useServerFn(assignReviewer);
	const assignMutation = useMutation({
		mutationFn: (input: { reviewerId?: string | null; directory?: DirectoryResult }) =>
			assignFn({ data: { ideaId, ...input } }),
		onSuccess: () => {
			toast.success("Reviewer updated");
			setAssignOpen(false);
			refresh();
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't assign"),
	});

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-sm font-medium">Assignment</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Owner + reassignment (#23: client's vocabulary — one "Owner" word) */}
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<span className="text-sm text-muted-foreground">Owner</span>
						<span className="text-sm font-medium">{assignedReviewerName ?? "Category Owner"}</span>
					</div>
					<Popover open={assignOpen} onOpenChange={setAssignOpen}>
						<PopoverTrigger asChild>
							<Button variant="outline" size="sm" className="w-full justify-between font-normal">
								<span className="flex items-center gap-2">
									<UserCog className="size-3.5" />
									Reassign
								</span>
								<ChevronsUpDown className="size-3.5 opacity-50" />
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
							<Command>
								<CommandInput placeholder="Search the category team…" />
								<CommandList>
									<CommandEmpty>No one is scoped to this category.</CommandEmpty>
									<CommandGroup>
										<CommandItem
											value="__owner__"
											onSelect={() => assignMutation.mutate({ reviewerId: null })}
											disabled={assignMutation.isPending}
										>
											Category Owner (default)
											{assignedReviewerId === null && (
												<span className="ml-auto text-xs text-muted-foreground">current</span>
											)}
										</CommandItem>
										{candidates.map((c) => (
											<CommandItem
												key={c.id}
												value={c.displayName}
												onSelect={() => assignMutation.mutate({ reviewerId: c.id })}
												disabled={assignMutation.isPending}
											>
												{c.displayName}
												<span className="ml-auto text-xs capitalize text-muted-foreground">
													{c.scopedRole}
												</span>
											</CommandItem>
										))}
									</CommandGroup>
								</CommandList>
							</Command>
							{/* Open-directory assignment (R29): anyone, inline-created on first touch. */}
							<div className="border-t p-2">
								<p className="mb-1.5 text-xs text-muted-foreground">
									Or assign anyone from the directory
								</p>
								<DirectoryPicker
									placeholder="Search everyone…"
									onSelect={(u) => assignMutation.mutate({ directory: u })}
								/>
							</div>
						</PopoverContent>
					</Popover>
					<p className="text-xs text-muted-foreground">This option will keep the category as is.</p>
				</div>

				{/* Category + change */}
				<div className="space-y-2 border-t pt-3">
					<p className="text-xs text-muted-foreground">…or reassign by category</p>
					<div className="flex items-center justify-between">
						<span className="text-sm text-muted-foreground">Category</span>
						<span className="text-sm font-medium">{categoryName}</span>
					</div>
					<Button
						variant="outline"
						size="sm"
						className="w-full justify-start gap-2 font-normal"
						onClick={() => setCategoryDialogOpen(true)}
					>
						<FolderInput className="size-3.5" />
						Change category
					</Button>
					<p className="text-xs text-muted-foreground">
						This option will go to the category owner and update the category.
					</p>
				</div>
			</CardContent>

			<ChangeCategoryDialog
				ideaId={ideaId}
				categoryId={categoryId}
				open={categoryDialogOpen}
				onOpenChange={setCategoryDialogOpen}
				onChanged={refresh}
			/>
		</Card>
	);
}

/** Reopen a closed idea (owner/admin) — returns it to New with a fresh SLA. */
export function ReopenControl({ ideaId, onChanged }: { ideaId: string; onChanged: () => void }) {
	const reopenFn = useServerFn(reopenIdea);
	const reopenMutation = useMutation({
		mutationFn: () => reopenFn({ data: { ideaId } }),
		onSuccess: () => {
			toast.success("Idea reopened — back to New");
			onChanged();
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't reopen"),
	});
	return (
		<Button
			variant="outline"
			size="sm"
			className="w-full gap-2"
			disabled={reopenMutation.isPending}
			onClick={() => reopenMutation.mutate()}
		>
			<RotateCcw className="size-3.5" />
			{reopenMutation.isPending ? "Reopening…" : "Reopen idea"}
		</Button>
	);
}

function ChangeCategoryDialog({
	ideaId,
	categoryId,
	open,
	onOpenChange,
	onChanged,
}: {
	ideaId: string;
	categoryId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onChanged: () => void;
}) {
	const [targetId, setTargetId] = useState("");
	const [reason, setReason] = useState<ReassignmentReason | "">("");
	const [aiReason, setAiReason] = useState<string | null>(null);

	const { data: categories = [] } = useQuery({
		queryKey: ["reassignable-categories"],
		queryFn: () => getReassignableCategories(),
		enabled: open,
	});
	const targets = categories.filter((c) => c.id !== categoryId);

	const changeFn = useServerFn(changeIdeaCategory);
	const triageFn = useServerFn(requestTriage);
	const suggestFn = useServerFn(suggestCategoryForIdea);

	const close = () => {
		onOpenChange(false);
		setTargetId("");
		setReason("");
		setAiReason(null);
	};

	const changeMutation = useMutation({
		mutationFn: () =>
			changeFn({ data: { ideaId, newCategoryId: targetId, reason: reason as ReassignmentReason } }),
		onSuccess: (r) => {
			toast.success(`Moved to ${r.newCategoryName}`);
			onChanged();
			close();
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't change category"),
	});

	const triageMutation = useMutation({
		mutationFn: () => triageFn({ data: { ideaId } }),
		onSuccess: () => {
			toast.success("Sent to admin triage");
			onChanged();
			close();
		},
		onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send to triage"),
	});

	const suggestMutation = useMutation({
		mutationFn: () => suggestFn({ data: { ideaId } }),
		onSuccess: (r) => {
			if (r.suggestion) {
				setTargetId(r.suggestion.categoryId);
				setAiReason(r.suggestion.reasoning);
			} else {
				toast.message("No confident suggestion — pick a category or send to triage.");
			}
		},
		onError: () => toast.error("Suggestion unavailable"),
	});

	return (
		<Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Change category</DialogTitle>
					<DialogDescription>
						Moving the idea changes its owner, resets the SLA, and clears the current assignment.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-1.5">
						<div className="flex items-center justify-between">
							<Label htmlFor="target-category">New category</Label>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 gap-1.5 text-xs"
								disabled={suggestMutation.isPending}
								onClick={() => suggestMutation.mutate()}
							>
								{suggestMutation.isPending ? (
									<Loader2 className="size-3.5 animate-spin" />
								) : (
									<Sparkles className="size-3.5" />
								)}
								Suggest with AI
							</Button>
						</div>
						<Select value={targetId} onValueChange={setTargetId}>
							<SelectTrigger id="target-category">
								<SelectValue placeholder="Pick a category…" />
							</SelectTrigger>
							<SelectContent>
								{targets.map((c) => (
									<SelectItem key={c.id} value={c.id}>
										{c.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{aiReason && <p className="text-xs text-muted-foreground">AI: {aiReason}</p>}
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="change-reason">
							Reason <span className="text-red-600">*</span>
						</Label>
						<Select value={reason} onValueChange={(v) => setReason(v as ReassignmentReason)}>
							<SelectTrigger id="change-reason">
								<SelectValue placeholder="Why is it moving?" />
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
				</div>

				<DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
					<Button
						variant="ghost"
						size="sm"
						className="text-muted-foreground"
						disabled={triageMutation.isPending}
						onClick={() => triageMutation.mutate()}
					>
						Need admin help — send to triage
					</Button>
					<Button
						disabled={!targetId || !reason || changeMutation.isPending}
						onClick={() => changeMutation.mutate()}
					>
						{changeMutation.isPending ? "Moving…" : "Move idea"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
