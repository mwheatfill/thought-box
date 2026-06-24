import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, Loader2, Plus, Power, Search, UserPlus } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { DataTable, SortableHeader } from "#/components/ui/data-table";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { RouteError } from "#/components/ui/route-error";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { ROLE_LABELS } from "#/lib/constants";
import { initials } from "#/lib/utils";
import {
	getUsers,
	searchDirectory,
	toggleUserActive,
	updateUserRole,
	upsertUser,
} from "#/server/functions/admin-users";

/** Derived-role badge colors (mirrors the UserCard role pills). */
const ROLE_BADGE_CLASS: Record<string, string> = {
	admin: "border-purple-300 text-purple-700 dark:text-purple-300",
	owner: "border-blue-300 text-blue-700 dark:text-blue-300",
	contributor: "border-amber-300 text-amber-700 dark:text-amber-300",
	submitter: "text-muted-foreground",
};

export const Route = createFileRoute("/admin/users")({
	errorComponent: ({ error }) => <RouteError error={error} />,
	beforeLoad: ({ context }) => {
		if (context.user.role !== "admin") {
			throw redirect({ to: "/dashboard" });
		}
	},
	loader: () => getUsers(),
	component: UsersPage,
});

// ── Types ─────────────────────────────────────────────────────────────────

interface UserRow {
	id: string;
	displayName: string;
	email: string;
	department: string | null;
	jobTitle: string | null;
	officeLocation: string | null;
	photoUrl: string | null;
	managerDisplayName: string | null;
	role: string;
	active: boolean;
	firstSeen: string | null;
	createdAt: string;
}

// ── Page ──────────────────────────────────────────────────────────────────

function UsersPage() {
	const initialUsers = Route.useLoaderData();
	const queryClient = useQueryClient();
	const [addDialogOpen, setAddDialogOpen] = useState(false);

	const { data: userList = initialUsers } = useQuery({
		queryKey: ["admin-users"],
		queryFn: () => getUsers(),
		initialData: initialUsers,
	});

	const roleFn = useServerFn(updateUserRole);
	const toggleFn = useServerFn(toggleUserActive);

	const roleMutation = useMutation({
		mutationFn: (params: { userId: string; role: "submitter" | "owner" | "admin" }) =>
			roleFn({ data: params }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-users"] });
			toast.success("Role updated");
		},
		onError: () => toast.error("Failed to update role"),
	});

	const toggleMutation = useMutation({
		mutationFn: (params: { userId: string; active: boolean }) => toggleFn({ data: params }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-users"] });
			toast.success("User updated");
		},
		onError: (err) => toast.error(err.message || "Failed to update user"),
	});

	const [pendingPromotion, setPendingPromotion] = useState<{
		userId: string;
		role: "admin";
		displayName: string;
	} | null>(null);

	const columns: ColumnDef<UserRow, unknown>[] = [
		{
			accessorKey: "displayName",
			header: ({ column }) => <SortableHeader column={column}>Name</SortableHeader>,
			cell: ({ row }) => {
				const u = row.original;
				return (
					<div className="flex items-center gap-2">
						<Avatar className="size-7">
							{u.photoUrl && <AvatarImage src={u.photoUrl} alt={u.displayName} />}
							<AvatarFallback className="text-[10px]">{initials(u.displayName)}</AvatarFallback>
						</Avatar>
						<div>
							<span className="font-medium">{u.displayName}</span>
							{!u.firstSeen && (
								<Badge variant="outline" className="ml-2 text-[10px]">
									Not logged in
								</Badge>
							)}
						</div>
					</div>
				);
			},
		},
		{
			accessorKey: "email",
			header: ({ column }) => <SortableHeader column={column}>Email</SortableHeader>,
			cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
		},
		{
			accessorKey: "department",
			header: ({ column }) => <SortableHeader column={column}>Department</SortableHeader>,
			cell: ({ row }) => (
				<span className="text-muted-foreground">{row.original.department ?? "—"}</span>
			),
		},
		{
			accessorKey: "role",
			header: ({ column }) => <SortableHeader column={column}>Role</SortableHeader>,
			cell: ({ row }) => {
				const u = row.original;
				const isAdmin = u.role === "admin";
				// Roles are derived (ADR-0003): Owner = owns a category, Contributor =
				// on a roster. The only manual control is the explicit admin grant.
				return (
					<div className="flex items-center gap-2">
						<Badge variant="outline" className={ROLE_BADGE_CLASS[u.role] ?? ""}>
							{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role}
						</Badge>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 text-xs text-muted-foreground"
							onClick={(e) => {
								e.stopPropagation();
								if (isAdmin) {
									roleMutation.mutate({ userId: u.id, role: "submitter" });
								} else {
									setPendingPromotion({ userId: u.id, role: "admin", displayName: u.displayName });
								}
							}}
						>
							{isAdmin ? "Remove admin" : "Make admin"}
						</Button>
					</div>
				);
			},
			filterFn: "equals",
		},
		{
			accessorKey: "active",
			header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
			cell: ({ row }) => (
				<Badge
					variant="outline"
					className={
						row.original.active
							? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
							: ""
					}
				>
					{row.original.active ? "Active" : "Inactive"}
				</Badge>
			),
			filterFn: (row, _columnId, filterValue) => {
				if (filterValue === "active") return row.original.active;
				if (filterValue === "inactive") return !row.original.active;
				return true;
			},
		},
		{
			id: "actions",
			cell: ({ row }) => (
				<div className="flex gap-1">
					<Button
						variant="ghost"
						size="icon"
						title={row.original.active ? "Deactivate" : "Activate"}
						onClick={(e) => {
							e.stopPropagation();
							toggleMutation.mutate({
								userId: row.original.id,
								active: !row.original.active,
							});
						}}
					>
						<Power className="size-3.5" />
					</Button>
				</div>
			),
		},
	];

	return (
		<main className="flex-1 bg-background p-6">
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Users</h1>
					<p className="text-muted-foreground">Manage user roles and account status.</p>
				</div>
				<Button onClick={() => setAddDialogOpen(true)}>
					<Plus className="mr-2 size-4" />
					Add User
				</Button>
			</div>

			<Card>
				<CardContent className="pt-6">
					<DataTable
						columns={columns}
						data={userList as UserRow[]}
						searchPlaceholder="Search users..."
						facetedFilters={[
							{
								columnId: "role",
								label: "Role",
								options: [
									{ value: "admin", label: "Admin" },
									{ value: "owner", label: "Owner" },
									{ value: "contributor", label: "Contributor" },
									{ value: "submitter", label: "Submitter" },
								],
							},
							{
								columnId: "active",
								label: "Status",
								options: [
									{ value: "active", label: "Active" },
									{ value: "inactive", label: "Inactive" },
								],
							},
						]}
						rowClassName={(u) => (!u.active ? "opacity-50" : "")}
					/>
				</CardContent>
			</Card>

			<AddUserDialog
				open={addDialogOpen}
				onOpenChange={setAddDialogOpen}
				onAdded={() => {
					queryClient.invalidateQueries({ queryKey: ["admin-users"] });
				}}
			/>

			{/* Make-admin confirmation dialog */}
			<Dialog
				open={!!pendingPromotion}
				onOpenChange={(open) => {
					if (!open) setPendingPromotion(null);
				}}
			>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Make administrator</DialogTitle>
						<DialogDescription>
							{pendingPromotion?.displayName} will become a ThoughtBox administrator with full
							access, and we'll email them to let them know. (Owner and Contributor roles are
							granted by assigning a category or adding someone to a roster — not here.)
						</DialogDescription>
					</DialogHeader>
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => setPendingPromotion(null)}>
							Cancel
						</Button>
						<Button
							disabled={roleMutation.isPending}
							onClick={async () => {
								if (!pendingPromotion) return;
								await roleMutation.mutateAsync({
									userId: pendingPromotion.userId,
									role: pendingPromotion.role,
								});
								setPendingPromotion(null);
							}}
						>
							{roleMutation.isPending ? "Updating…" : "Make admin"}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</main>
	);
}

// ── Add User Dialog ───────────────────────────────────────────────────────

interface DirectoryResult {
	entraId: string;
	displayName: string;
	email: string;
	jobTitle: string | null;
	department: string | null;
	officeLocation: string | null;
}

function AddUserDialog({
	open,
	onOpenChange,
	onAdded,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAdded: () => void;
}) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<DirectoryResult[]>([]);
	const [searching, setSearching] = useState(false);
	const [selectedUser, setSelectedUser] = useState<DirectoryResult | null>(null);
	const [role, setRole] = useState<"submitter" | "owner" | "admin">("submitter");

	const searchFn = useServerFn(searchDirectory);
	const upsertFn = useServerFn(upsertUser);

	const doSearch = useCallback(
		async (q: string) => {
			if (q.length < 2) {
				setResults([]);
				return;
			}
			setSearching(true);
			try {
				const data = await searchFn({ data: { query: q } });
				setResults(data);
			} finally {
				setSearching(false);
			}
		},
		[searchFn],
	);

	const addMutation = useMutation({
		mutationFn: async () => {
			if (!selectedUser) return;
			return upsertFn({
				data: {
					entraId: selectedUser.entraId,
					displayName: selectedUser.displayName,
					email: selectedUser.email,
					jobTitle: selectedUser.jobTitle,
					department: selectedUser.department,
					officeLocation: selectedUser.officeLocation,
					role,
				},
			});
		},
		onSuccess: (result) => {
			onAdded();
			onOpenChange(false);
			setQuery("");
			setResults([]);
			setSelectedUser(null);
			setRole("submitter");
			toast.success(result?.created ? "User added from directory" : "User updated");
		},
		onError: () => toast.error("Failed to add user"),
	});

	const handleQueryChange = (value: string) => {
		setQuery(value);
		setSelectedUser(null);
		const timeout = setTimeout(() => doSearch(value), 300);
		return () => clearTimeout(timeout);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				onOpenChange(v);
				if (!v) {
					setQuery("");
					setResults([]);
					setSelectedUser(null);
					setRole("submitter");
				}
			}}
		>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Add User from Directory</DialogTitle>
					<DialogDescription>
						Search the employee directory to add a user before they log in.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label>Search Directory</Label>
						<div className="relative">
							<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={query}
								onChange={(e) => handleQueryChange(e.target.value)}
								placeholder="Type a name or email..."
								className="pl-9"
							/>
							{searching && (
								<Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
							)}
						</div>
					</div>

					{results.length > 0 && !selectedUser && (
						<div className="max-h-[200px] space-y-1 overflow-y-auto rounded-md border p-1">
							{results.map((u) => (
								<button
									key={u.entraId}
									type="button"
									onClick={() => setSelectedUser(u)}
									className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
								>
									<UserPlus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
									<div className="min-w-0">
										<p className="font-medium">{u.displayName}</p>
										<p className="text-xs text-muted-foreground">{u.email}</p>
										{(u.jobTitle || u.department) && (
											<p className="text-xs text-muted-foreground">
												{[u.jobTitle, u.department].filter(Boolean).join(" · ")}
											</p>
										)}
									</div>
								</button>
							))}
						</div>
					)}

					{query.length >= 2 && results.length === 0 && !searching && !selectedUser && (
						<p className="py-4 text-center text-sm text-muted-foreground">
							No users found matching "{query}"
						</p>
					)}

					{selectedUser && (
						<div className="rounded-md border bg-muted/50 p-4">
							<div className="flex items-start justify-between">
								<div>
									<p className="font-medium">{selectedUser.displayName}</p>
									<p className="text-sm text-muted-foreground">{selectedUser.email}</p>
									{selectedUser.jobTitle && (
										<p className="text-xs text-muted-foreground">{selectedUser.jobTitle}</p>
									)}
									{selectedUser.department && (
										<div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
											<Building2 className="size-3" />
											{selectedUser.department}
										</div>
									)}
								</div>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => {
										setSelectedUser(null);
										setResults([]);
									}}
								>
									Change
								</Button>
							</div>

							<div className="mt-3 space-y-1.5">
								<Label>Role</Label>
								<Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="submitter">Submitter</SelectItem>
										<SelectItem value="admin">Admin</SelectItem>
									</SelectContent>
								</Select>
								{role === "admin" && (
									<p className="text-xs text-muted-foreground">
										They'll get an email letting them know they're now an admin.
									</p>
								)}
							</div>
						</div>
					)}
				</div>

				<div className="flex justify-end gap-2 pt-2">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={() => addMutation.mutate()}
						disabled={!selectedUser || addMutation.isPending}
					>
						{addMutation.isPending ? "Adding..." : "Add User"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
