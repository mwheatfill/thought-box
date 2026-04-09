import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Power, Shield, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
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
import { cn } from "#/lib/utils";
import { getUsers, toggleUserActive, updateUserRole } from "#/server/functions/admin-users";

export const Route = createFileRoute("/admin/users")({
	beforeLoad: ({ context }) => {
		if (context.user.role !== "admin") {
			throw redirect({ to: "/dashboard" });
		}
	},
	loader: () => getUsers(),
	component: UsersPage,
});

const ROLE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
	admin: ShieldCheck,
	leader: Shield,
	submitter: User,
};

function UsersPage() {
	const initialUsers = Route.useLoaderData();
	const queryClient = useQueryClient();

	const { data: userList = initialUsers } = useQuery({
		queryKey: ["admin-users"],
		queryFn: () => getUsers(),
		initialData: initialUsers,
	});

	const roleFn = useServerFn(updateUserRole);
	const toggleFn = useServerFn(toggleUserActive);

	const roleMutation = useMutation({
		mutationFn: (params: { userId: string; role: "submitter" | "leader" | "admin" }) =>
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
	});

	return (
		<main className="flex-1 p-6">
			<div className="mb-6">
				<h1 className="text-2xl font-bold tracking-tight">Users</h1>
				<p className="text-muted-foreground">Manage user roles and account status.</p>
			</div>

			<Card>
				<CardContent className="p-0">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Email</TableHead>
								<TableHead>Department</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="w-[60px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{userList.map((u) => {
								const RoleIcon = ROLE_ICONS[u.role] ?? User;
								return (
									<TableRow key={u.id} className={cn(!u.active && "opacity-50")}>
										<TableCell>
											<div className="flex items-center gap-2">
												<RoleIcon className="size-4 text-muted-foreground" />
												<span className="font-medium">{u.displayName}</span>
											</div>
										</TableCell>
										<TableCell className="text-muted-foreground">{u.email}</TableCell>
										<TableCell className="text-muted-foreground">{u.department ?? "—"}</TableCell>
										<TableCell>
											<Select
												value={u.role}
												onValueChange={(role) =>
													roleMutation.mutate({
														userId: u.id,
														role: role as "submitter" | "leader" | "admin",
													})
												}
											>
												<SelectTrigger className="h-8 w-[130px]">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="submitter">Submitter</SelectItem>
													<SelectItem value="leader">Leader</SelectItem>
													<SelectItem value="admin">Admin</SelectItem>
												</SelectContent>
											</Select>
										</TableCell>
										<TableCell>
											<Badge variant={u.active ? "default" : "outline"}>
												{u.active ? "Active" : "Inactive"}
											</Badge>
										</TableCell>
										<TableCell>
											<Button
												variant="ghost"
												size="icon"
												onClick={() =>
													toggleMutation.mutate({
														userId: u.id,
														active: !u.active,
													})
												}
											>
												<Power className="size-3.5" />
											</Button>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</main>
	);
}
