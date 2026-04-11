import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	Check,
	ChevronsUpDown,
	ExternalLink,
	MoveDown,
	MoveUp,
	Plus,
	RotateCcw,
	Search,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
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
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { RouteError } from "#/components/ui/route-error";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { Textarea } from "#/components/ui/textarea";
import { cn } from "#/lib/utils";
import {
	createCategory,
	deleteCategory,
	getCategories,
	getDeletedCategories,
	getLeaders,
	restoreCategory,
	updateCategory,
} from "#/server/functions/categories";

export const Route = createFileRoute("/admin/categories")({
	errorComponent: ({ error }) => <RouteError error={error} />,
	beforeLoad: ({ context }) => {
		if (context.user.role !== "admin") {
			throw redirect({ to: "/dashboard" });
		}
	},
	loader: async () => {
		const [cats, leaders] = await Promise.all([getCategories(), getLeaders()]);
		return { categories: cats, leaders };
	},
	component: CategoriesPage,
});

interface CategoryForm {
	name: string;
	description: string;
	routingType: "thoughtbox" | "redirect";
	redirectUrl: string;
	redirectLabel: string;
	defaultLeaderId: string;
	sortOrder: number;
}

const emptyForm: CategoryForm = {
	name: "",
	description: "",
	routingType: "thoughtbox",
	redirectUrl: "",
	redirectLabel: "",
	defaultLeaderId: "",
	sortOrder: 0,
};

function CategoriesPage() {
	const { categories: initialCategories, leaders } = Route.useLoaderData();
	const queryClient = useQueryClient();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [showDeleted, setShowDeleted] = useState(false);
	const [form, setForm] = useState<CategoryForm>(emptyForm);
	const [leaderPopoverOpen, setLeaderPopoverOpen] = useState(false);
	const [search, setSearch] = useState("");

	const { data: cats = initialCategories } = useQuery({
		queryKey: ["admin-categories"],
		queryFn: () => getCategories(),
		initialData: initialCategories,
	});

	const createFn = useServerFn(createCategory);
	const updateFn = useServerFn(updateCategory);

	const saveMutation = useMutation({
		mutationFn: async () => {
			if (editingId) {
				await updateFn({
					data: {
						id: editingId,
						name: form.name,
						description: form.description,
						routingType: form.routingType,
						redirectUrl: form.routingType === "redirect" ? form.redirectUrl : null,
						redirectLabel: form.routingType === "redirect" ? form.redirectLabel : null,
						defaultLeaderId: form.defaultLeaderId || null,
						sortOrder: form.sortOrder,
					},
				});
			} else {
				await createFn({
					data: {
						name: form.name,
						description: form.description,
						routingType: form.routingType,
						redirectUrl: form.routingType === "redirect" ? form.redirectUrl : null,
						redirectLabel: form.routingType === "redirect" ? form.redirectLabel : null,
						defaultLeaderId: form.defaultLeaderId || null,
						sortOrder: form.sortOrder,
					},
				});
			}
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
			setDialogOpen(false);
			toast.success(editingId ? "Category updated" : "Category created");
		},
		onError: () => toast.error("Failed to save category"),
	});

	const deleteFn = useServerFn(deleteCategory);
	const restoreFn = useServerFn(restoreCategory);

	const deleteMutation = useMutation({
		mutationFn: (id: string) => deleteFn({ data: { id } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
			queryClient.invalidateQueries({ queryKey: ["admin-deleted-categories"] });
			toast.success("Category deleted");
		},
	});

	const restoreMutation = useMutation({
		mutationFn: (id: string) => restoreFn({ data: { id } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
			queryClient.invalidateQueries({ queryKey: ["admin-deleted-categories"] });
			toast.success("Category restored");
		},
	});

	const { data: deletedCats = [] } = useQuery({
		queryKey: ["admin-deleted-categories"],
		queryFn: () => getDeletedCategories(),
	});

	const moveMutation = useMutation({
		mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) => {
			const idx = cats.findIndex((c) => c.id === id);
			if (idx < 0) return;
			const swapIdx = direction === "up" ? idx - 1 : idx + 1;
			if (swapIdx < 0 || swapIdx >= cats.length) return;

			await Promise.all([
				updateFn({ data: { id: cats[idx].id, sortOrder: cats[swapIdx].sortOrder } }),
				updateFn({ data: { id: cats[swapIdx].id, sortOrder: cats[idx].sortOrder } }),
			]);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
		},
	});

	function openCreate() {
		setEditingId(null);
		setForm({
			...emptyForm,
			sortOrder: cats.length > 0 ? Math.max(...cats.map((c) => c.sortOrder)) + 1 : 1,
		});
		setDialogOpen(true);
	}

	function openEdit(cat: (typeof cats)[number]) {
		setEditingId(cat.id);
		setForm({
			name: cat.name,
			description: cat.description,
			routingType: cat.routingType,
			redirectUrl: cat.redirectUrl ?? "",
			redirectLabel: cat.redirectLabel ?? "",
			defaultLeaderId: cat.defaultLeaderId ?? "",
			sortOrder: cat.sortOrder,
		});
		setDialogOpen(true);
	}

	const selectedLeader = leaders.find((l) => l.id === form.defaultLeaderId);

	return (
		<main className="flex-1 bg-background p-6">
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Categories</h1>
					<p className="text-muted-foreground">Manage the idea category taxonomy and routing.</p>
				</div>
				<Button onClick={openCreate}>
					<Plus className="mr-2 size-4" />
					Add Category
				</Button>
			</div>

			<Card>
				<CardContent className="p-0">
					{cats.length > 5 && (
						<div className="relative border-b px-4 py-3">
							<Search className="absolute left-6.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder="Search categories..."
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								className="h-9 max-w-xs pl-8"
							/>
						</div>
					)}
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[70px]">Order</TableHead>
								<TableHead>Name</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Default Leader</TableHead>
								<TableHead className="w-[80px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{cats
								.filter((cat) => {
									if (!search) return true;
									const s = search.toLowerCase();
									return (
										cat.name.toLowerCase().includes(s) || cat.description.toLowerCase().includes(s)
									);
								})
								.map((cat, idx) => (
									<TableRow
										key={cat.id}
										className={cn("group cursor-pointer", !cat.active && "opacity-50")}
										onClick={() => openEdit(cat)}
									>
										<TableCell>
											{/* biome-ignore lint/a11y/useKeyWithClickEvents: order buttons are interactive */}
											<div
												className="flex items-center gap-0.5"
												onClick={(e) => e.stopPropagation()}
											>
												<Button
													variant="ghost"
													size="icon"
													className="size-6"
													disabled={idx === 0 || moveMutation.isPending}
													onClick={() => moveMutation.mutate({ id: cat.id, direction: "up" })}
												>
													<MoveUp className="size-3" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													className="size-6"
													disabled={idx === cats.length - 1 || moveMutation.isPending}
													onClick={() => moveMutation.mutate({ id: cat.id, direction: "down" })}
												>
													<MoveDown className="size-3" />
												</Button>
											</div>
										</TableCell>
										<TableCell>
											<div>
												<p className="font-medium">{cat.name}</p>
												<p className="text-xs text-muted-foreground line-clamp-1">
													{cat.description}
												</p>
											</div>
										</TableCell>
										<TableCell>
											{cat.routingType === "redirect" ? (
												<Badge variant="outline" className="gap-1">
													<ExternalLink className="size-3" />
													Redirect
												</Badge>
											) : (
												<Badge variant="secondary">ThoughtBox</Badge>
											)}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{cat.defaultLeaderName ?? "—"}
										</TableCell>
										<TableCell>
											<Button
												variant="ghost"
												size="icon"
												title="Delete category"
												className="opacity-0 group-hover:opacity-100 transition-opacity"
												onClick={(e) => {
													e.stopPropagation();
													deleteMutation.mutate(cat.id);
												}}
											>
												<Trash2 className="size-3.5" />
											</Button>
										</TableCell>
									</TableRow>
								))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			{/* Recently deleted toggle */}
			{deletedCats.length > 0 && (
				<div className="mt-4">
					<div className="flex justify-end">
						<button
							type="button"
							onClick={() => setShowDeleted(!showDeleted)}
							className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
						>
							Recently deleted
							<Badge variant="secondary" className="text-[10px]">
								{deletedCats.length}
							</Badge>
						</button>
					</div>
					{showDeleted && (
						<Card className="mt-2">
							<CardContent className="pt-4">
								<div className="space-y-2">
									{deletedCats.map((cat) => (
										<div
											key={cat.id}
											className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-sm"
										>
											<div>
												<span className="font-medium">{cat.name}</span>
												<span className="ml-2 text-xs text-muted-foreground">
													deleted{" "}
													{cat.deletedAt
														? new Date(cat.deletedAt).toLocaleDateString()
														: "recently"}
												</span>
											</div>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => restoreMutation.mutate(cat.id)}
												disabled={restoreMutation.isPending}
											>
												<RotateCcw className="mr-1 size-3.5" />
												Restore
											</Button>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					)}
				</div>
			)}

			{/* Create/Edit Dialog */}
			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>{editingId ? "Edit Category" : "New Category"}</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-1.5">
							<Label>Name</Label>
							<Input
								value={form.name}
								onChange={(e) => setForm({ ...form, name: e.target.value })}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Description</Label>
							<Textarea
								value={form.description}
								onChange={(e) => setForm({ ...form, description: e.target.value })}
								className="min-h-[80px]"
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Routing Type</Label>
							<Select
								value={form.routingType}
								onValueChange={(v) =>
									setForm({ ...form, routingType: v as "thoughtbox" | "redirect" })
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="thoughtbox">ThoughtBox</SelectItem>
									<SelectItem value="redirect">Redirect</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{form.routingType === "redirect" && (
							<>
								<div className="space-y-1.5">
									<Label>Redirect URL</Label>
									<Input
										value={form.redirectUrl}
										onChange={(e) => setForm({ ...form, redirectUrl: e.target.value })}
										placeholder="https://..."
									/>
								</div>
								<div className="space-y-1.5">
									<Label>Redirect Button Label</Label>
									<Input
										value={form.redirectLabel}
										onChange={(e) => setForm({ ...form, redirectLabel: e.target.value })}
										placeholder="Submit a request"
									/>
								</div>
							</>
						)}

						{form.routingType === "thoughtbox" && (
							<div className="space-y-1.5">
								<Label>Default Leader</Label>
								<Popover open={leaderPopoverOpen} onOpenChange={setLeaderPopoverOpen}>
									<PopoverTrigger asChild>
										<Button variant="outline" className="w-full justify-between font-normal">
											{selectedLeader?.displayName ?? "Search for a leader..."}
											<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
										<Command>
											<CommandInput placeholder="Type a name..." />
											<CommandList>
												<CommandEmpty>No leaders found.</CommandEmpty>
												<CommandGroup>
													{leaders.map((l) => (
														<CommandItem
															key={l.id}
															value={l.displayName}
															onSelect={() => {
																setForm({ ...form, defaultLeaderId: l.id });
																setLeaderPopoverOpen(false);
															}}
														>
															<Check
																className={cn(
																	"mr-2 size-4",
																	form.defaultLeaderId === l.id ? "opacity-100" : "opacity-0",
																)}
															/>
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
						)}
					</div>
					<DialogFooter className="flex-row justify-between sm:justify-between">
						{editingId ? (
							<Button
								variant="ghost"
								className="text-destructive hover:text-destructive hover:bg-destructive/10"
								onClick={() => {
									deleteMutation.mutate(editingId);
									setDialogOpen(false);
								}}
							>
								<Trash2 className="mr-2 size-3.5" />
								Delete
							</Button>
						) : (
							<div />
						)}
						<div className="flex gap-2">
							<Button variant="outline" onClick={() => setDialogOpen(false)}>
								Cancel
							</Button>
							<Button
								onClick={() => saveMutation.mutate()}
								disabled={!form.name || !form.description || saveMutation.isPending}
							>
								{saveMutation.isPending ? "Saving..." : editingId ? "Update" : "Create"}
							</Button>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</main>
	);
}
