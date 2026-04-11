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
	// Computed for display + search
	actionLabel: string;
	typeLabel: string;
	resourceLabel: string;
	detailsSummary: string;
}

const ACTION_LABELS: Record<string, string> = {
	"idea.created": "Create",
	"idea.status_changed": "Change Status",
	"idea.reassigned": "Reassign",
	"user.added": "Create",
	"user.updated": "Update",
	"user.role_changed": "Change Role",
	"user.invited": "Invite",
	"user.activated": "Activate",
	"user.deactivated": "Deactivate",
	"settings.updated": "Update",
	"category.created": "Create",
	"category.deleted": "Delete",
	"category.restored": "Restore",
	"attachment.uploaded": "Upload",
	"attachment.deleted": "Delete",
	"attachment.restored": "Restore",
};

const TYPE_LABELS: Record<string, string> = {
	idea: "Idea",
	user: "User",
	setting: "Setting",
	category: "Category",
	attachment: "File",
};

function formatDetails(details: Record<string, unknown> | null): string {
	if (!details) return "";
	const parts: string[] = [];
	if (details.name) parts.push(String(details.name));
	if (details.filename) parts.push(String(details.filename));
	if (details.title) parts.push(String(details.title));
	if (details.from && details.to) parts.push(`${details.from} → ${details.to}`);
	if (details.category) parts.push(String(details.category));
	if (details.role && !details.from) parts.push(`Role: ${details.role}`);
	if (details.email) parts.push(String(details.email));
	if (details.value && !details.name && !details.filename) {
		parts.push(String(details.value).slice(0, 50));
	}
	return parts.join(" · ");
}

function enrichEntry(
	raw: Omit<AuditEntry, "actionLabel" | "typeLabel" | "resourceLabel" | "detailsSummary">,
): AuditEntry {
	const actionLabel = ACTION_LABELS[raw.action] ?? raw.action;
	const typeLabel = TYPE_LABELS[raw.resourceType] ?? raw.resourceType;
	const detailsSummary = formatDetails(raw.details);

	// Show friendly resource name: prefer details.name/filename, fall back to resourceId
	let resourceLabel = raw.resourceId ?? "";
	if (raw.details?.name) resourceLabel = String(raw.details.name);
	if (raw.details?.filename) resourceLabel = String(raw.details.filename);
	if (raw.details?.title) resourceLabel = String(raw.details.title);

	return { ...raw, actionLabel, typeLabel, resourceLabel, detailsSummary };
}

const columns: ColumnDef<AuditEntry, unknown>[] = [
	{
		accessorKey: "createdAt",
		header: ({ column }) => <SortableHeader column={column}>When</SortableHeader>,
		cell: ({ row }) => (
			<span className="whitespace-nowrap text-muted-foreground">
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
		accessorKey: "actionLabel",
		header: ({ column }) => <SortableHeader column={column}>Action</SortableHeader>,
		cell: ({ row }) => <span>{row.original.actionLabel}</span>,
	},
	{
		accessorKey: "typeLabel",
		header: "Type",
		cell: ({ row }) => <span className="text-muted-foreground">{row.original.typeLabel}</span>,
		filterFn: "equals",
	},
	{
		accessorKey: "resourceLabel",
		header: "Resource",
		cell: ({ row }) => (
			<span
				className="max-w-[200px] truncate text-sm text-muted-foreground"
				title={row.original.resourceLabel}
			>
				{row.original.resourceLabel || "—"}
			</span>
		),
	},
	{
		accessorKey: "detailsSummary",
		header: "Details",
		cell: ({ row }) => {
			const s = row.original.detailsSummary;
			if (!s) return <span className="text-muted-foreground">—</span>;
			return (
				<span className="max-w-[250px] truncate text-xs text-muted-foreground" title={s}>
					{s}
				</span>
			);
		},
	},
];

function AuditPage() {
	const initialData = Route.useLoaderData();

	const { data: rawEntries = initialData } = useQuery({
		queryKey: ["admin-audit"],
		queryFn: () => getAuditLog(),
		initialData,
	});

	const entries = (rawEntries as AuditEntry[]).map(enrichEntry);

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
						data={entries}
						searchPlaceholder="Search by user, action, or resource..."
						facetedFilters={[
							{
								columnId: "typeLabel",
								label: "Type",
								options: Object.values(TYPE_LABELS)
									.sort()
									.map((label) => ({ value: label, label })),
							},
						]}
						pageSize={25}
					/>
				</CardContent>
			</Card>
		</main>
	);
}
