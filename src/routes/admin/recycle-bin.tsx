import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { DataTable, SortableHeader } from "#/components/ui/data-table";
import { RouteError } from "#/components/ui/route-error";
import { getRecycleBin, restoreItem } from "#/server/functions/recycle-bin";

export const Route = createFileRoute("/admin/recycle-bin")({
	errorComponent: ({ error }) => <RouteError error={error} />,
	beforeLoad: ({ context }) => {
		if (context.user.role !== "admin") {
			throw redirect({ to: "/dashboard" });
		}
	},
	loader: () => getRecycleBin(),
	component: RecycleBinPage,
});

interface RecycleItem {
	id: string;
	type: "category" | "attachment";
	name: string;
	details: string;
	deletedAt: string;
	deletedBy: string;
}

const TYPE_LABELS: Record<string, string> = {
	category: "Category",
	attachment: "Attachment",
};

function RecycleBinPage() {
	const initialData = Route.useLoaderData();
	const queryClient = useQueryClient();

	const { data: items = initialData } = useQuery({
		queryKey: ["admin-recycle-bin"],
		queryFn: () => getRecycleBin(),
		initialData,
	});

	const restoreFn = useServerFn(restoreItem);
	const restoreMutation = useMutation({
		mutationFn: (params: { id: string; type: "category" | "attachment" }) =>
			restoreFn({ data: params }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-recycle-bin"] });
			queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
			queryClient.invalidateQueries({ queryKey: ["admin-deleted-categories"] });
			toast.success("Item restored");
		},
		onError: () => toast.error("Failed to restore"),
	});

	const columns: ColumnDef<RecycleItem, unknown>[] = [
		{
			accessorKey: "type",
			header: "Type",
			cell: ({ row }) => (
				<span className="text-muted-foreground">
					{TYPE_LABELS[row.original.type] ?? row.original.type}
				</span>
			),
			filterFn: "equals",
		},
		{
			accessorKey: "name",
			header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
			cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
		},
		{
			accessorKey: "details",
			header: "Details",
			cell: ({ row }) => (
				<span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
					{row.original.details}
				</span>
			),
		},
		{
			accessorKey: "deletedBy",
			header: "Deleted By",
			cell: ({ row }) => <span className="text-muted-foreground">{row.original.deletedBy}</span>,
		},
		{
			accessorKey: "deletedAt",
			header: ({ column }) => <SortableHeader column={column}>When</SortableHeader>,
			cell: ({ row }) => (
				<span className="text-muted-foreground">
					{formatDistanceToNow(new Date(row.original.deletedAt), { addSuffix: true })}
				</span>
			),
		},
		{
			id: "actions",
			cell: ({ row }) => (
				<Button
					variant="ghost"
					size="sm"
					onClick={(e) => {
						e.stopPropagation();
						restoreMutation.mutate({
							id: row.original.id,
							type: row.original.type,
						});
					}}
					disabled={restoreMutation.isPending}
				>
					<RotateCcw className="mr-1 size-3.5" />
					Restore
				</Button>
			),
		},
	];

	return (
		<main className="flex-1 bg-background p-6">
			<div className="mb-6">
				<h1 className="text-2xl font-bold tracking-tight">Recycle Bin</h1>
				<p className="text-muted-foreground">
					Deleted items across ThoughtBox. Restore items to bring them back.
				</p>
			</div>

			<Card>
				<CardContent className="pt-6">
					{items.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<div className="mb-4 rounded-full bg-muted p-4">
								<Trash2 className="size-8 text-muted-foreground" />
							</div>
							<h2 className="mb-2 text-lg font-semibold">Recycle bin is empty</h2>
							<p className="text-sm text-muted-foreground">
								Deleted categories and attachments will appear here.
							</p>
						</div>
					) : (
						<DataTable
							columns={columns}
							data={items as RecycleItem[]}
							searchPlaceholder="Search deleted items..."
							facetedFilters={[
								{
									columnId: "type",
									label: "Type",
									options: Object.entries(TYPE_LABELS).map(([value, label]) => ({
										value,
										label,
									})),
								},
							]}
						/>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
