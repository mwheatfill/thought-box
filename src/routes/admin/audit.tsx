import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "#/components/ui/card";
import { DataTable, SortableHeader } from "#/components/ui/data-table";
import { RouteError } from "#/components/ui/route-error";
import { getAuditLog } from "#/server/functions/audit";

export const Route = createFileRoute("/admin/audit")({
	errorComponent: ({ error }) => <RouteError error={error} />,
	beforeLoad: ({ context }) => {
		if (context.user.role !== "admin") {
			throw redirect({ to: "/dashboard" });
		}
	},
	loader: () => getAuditLog(),
	component: AuditPage,
});

interface AuditEntry {
	id: string;
	actorName: string;
	action: string;
	resourceType: string;
	resourceId: string | null;
	details: Record<string, unknown> | null;
	createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
	"idea.created": "Idea Created",
	"idea.status_changed": "Status Changed",
	"idea.reassigned": "Idea Reassigned",
	"user.added": "User Added",
	"user.updated": "User Updated",
	"user.role_changed": "Role Changed",
	"user.activated": "User Activated",
	"user.deactivated": "User Deactivated",
	"settings.updated": "Setting Updated",
};

const RESOURCE_TYPE_LABELS: Record<string, string> = {
	idea: "Idea",
	user: "User",
	setting: "Setting",
};

const columns: ColumnDef<AuditEntry, unknown>[] = [
	{
		accessorKey: "createdAt",
		header: ({ column }) => <SortableHeader column={column}>When</SortableHeader>,
		cell: ({ row }) => (
			<span className="text-muted-foreground whitespace-nowrap">
				{formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true })}
			</span>
		),
	},
	{
		accessorKey: "actorName",
		header: ({ column }) => <SortableHeader column={column}>Who</SortableHeader>,
		cell: ({ row }) => <span className="font-medium">{row.original.actorName}</span>,
	},
	{
		accessorKey: "action",
		header: ({ column }) => <SortableHeader column={column}>Action</SortableHeader>,
		cell: ({ row }) => <span>{ACTION_LABELS[row.original.action] ?? row.original.action}</span>,
		filterFn: "equals",
	},
	{
		accessorKey: "resourceType",
		header: "Type",
		cell: ({ row }) => (
			<span className="text-muted-foreground">
				{RESOURCE_TYPE_LABELS[row.original.resourceType] ?? row.original.resourceType}
			</span>
		),
		filterFn: "equals",
	},
	{
		accessorKey: "resourceId",
		header: "Resource",
		cell: ({ row }) => (
			<span className="font-mono text-xs text-muted-foreground">
				{row.original.resourceId ?? "—"}
			</span>
		),
	},
	{
		accessorKey: "details",
		header: "Details",
		cell: ({ row }) => {
			const d = row.original.details;
			if (!d) return <span className="text-muted-foreground">—</span>;
			const summary = Object.entries(d)
				.map(([k, v]) => `${k}: ${v}`)
				.join(", ");
			return (
				<span className="text-xs text-muted-foreground line-clamp-1 max-w-[300px]" title={summary}>
					{summary}
				</span>
			);
		},
	},
];

function AuditPage() {
	const initialData = Route.useLoaderData();

	const { data: entries = initialData } = useQuery({
		queryKey: ["admin-audit"],
		queryFn: () => getAuditLog(),
		initialData,
	});

	return (
		<main className="flex-1 bg-background p-6">
			<div className="mb-6">
				<h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
				<p className="text-muted-foreground">
					Complete history of actions taken across ThoughtBox.
				</p>
			</div>

			<Card>
				<CardContent className="pt-6">
					<DataTable
						columns={columns}
						data={entries as AuditEntry[]}
						searchPlaceholder="Search audit log..."
						facetedFilters={[
							{
								columnId: "action",
								label: "Action",
								options: Object.entries(ACTION_LABELS).map(([value, label]) => ({
									value,
									label,
								})),
							},
							{
								columnId: "resourceType",
								label: "Type",
								options: Object.entries(RESOURCE_TYPE_LABELS).map(([value, label]) => ({
									value,
									label,
								})),
							},
						]}
						pageSize={25}
					/>
				</CardContent>
			</Card>
		</main>
	);
}
