import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, GripVertical, Pencil, Plus, Power } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
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
	getCategories,
	getLeaders,
	updateCategory,
} from "#/server/functions/categories";

export const Route = createFileRoute("/admin/categories")({
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
	const [form, setForm] = useState<CategoryForm>(emptyForm);

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

	const toggleMutation = useMutation({
		mutationFn: (cat: { id: string; active: boolean }) =>
			updateFn({ data: { id: cat.id, active: !cat.active } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
			toast.success("Category updated");
		},
	});

	function openCreate() {
		setEditingId(null);
		setForm(emptyForm);
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

	return (
		<main className="flex-1 p-6">
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
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[40px]" />
								<TableHead>Name</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Default Leader</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="w-[80px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{cats.map((cat) => (
								<TableRow key={cat.id} className={cn(!cat.active && "opacity-50")}>
									<TableCell>
										<GripVertical className="size-4 text-muted-foreground" />
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
										<Badge variant={cat.active ? "default" : "outline"}>
											{cat.active ? "Active" : "Inactive"}
										</Badge>
									</TableCell>
									<TableCell>
										<div className="flex gap-1">
											<Button variant="ghost" size="icon" onClick={() => openEdit(cat)}>
												<Pencil className="size-3.5" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => toggleMutation.mutate(cat)}
											>
												<Power className="size-3.5" />
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

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
						<div className="grid grid-cols-2 gap-4">
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
							<div className="space-y-1.5">
								<Label>Sort Order</Label>
								<Input
									type="number"
									value={form.sortOrder}
									onChange={(e) =>
										setForm({ ...form, sortOrder: Number.parseInt(e.target.value) || 0 })
									}
								/>
							</div>
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
								<Select
									value={form.defaultLeaderId}
									onValueChange={(v) => setForm({ ...form, defaultLeaderId: v })}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select a leader..." />
									</SelectTrigger>
									<SelectContent>
										{leaders.map((l) => (
											<SelectItem key={l.id} value={l.id}>
												{l.displayName}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDialogOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={() => saveMutation.mutate()}
							disabled={!form.name || !form.description || saveMutation.isPending}
						>
							{saveMutation.isPending ? "Saving..." : editingId ? "Update" : "Create"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</main>
	);
}
