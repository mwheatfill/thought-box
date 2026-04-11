"use client";

import { useQuery } from "@tanstack/react-query";
import { Building, Lightbulb, Mail, MapPin, Sparkles, UserCheck, Users } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { Skeleton } from "#/components/ui/skeleton";
import { cn } from "#/lib/utils";
import { getUserCard } from "#/server/functions/users";

const ROLE_STYLES: Record<string, string> = {
	admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
	leader: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
	submitter: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

interface UserCardPopoverProps {
	userId: string;
	children: ReactNode;
}

export function UserCardPopover({ userId, children }: UserCardPopoverProps) {
	const [open, setOpen] = useState(false);

	const { data: user, isLoading } = useQuery({
		queryKey: ["user-card", userId],
		queryFn: () => getUserCard({ data: { userId } }),
		enabled: open,
		staleTime: 60_000,
	});

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent className="w-80 p-0" align="start">
				{isLoading || !user ? (
					<div className="space-y-4 p-5">
						<div className="flex items-center gap-4">
							<Skeleton className="size-12 rounded-full" />
							<div className="space-y-2">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-5 w-16 rounded-full" />
							</div>
						</div>
						<div className="space-y-2">
							<Skeleton className="h-3.5 w-full" />
							<Skeleton className="h-3.5 w-3/4" />
						</div>
					</div>
				) : (
					<>
						{/* Header */}
						<div className="flex items-center gap-4 p-5 pb-4">
							<Avatar className="size-12">
								{user.photoUrl && (
									<AvatarImage src={user.photoUrl} alt={user.displayName} />
								)}
								<AvatarFallback className="text-sm">
									{user.displayName
										.split(" ")
										.map((n) => n[0])
										.join("")
										.slice(0, 2)}
								</AvatarFallback>
							</Avatar>
							<div className="min-w-0">
								<p className="text-base font-semibold leading-tight">{user.displayName}</p>
								{user.jobTitle && (
									<p className="mt-0.5 text-sm text-muted-foreground">{user.jobTitle}</p>
								)}
								<span
									className={cn(
										"mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
										ROLE_STYLES[user.role] ?? ROLE_STYLES.submitter,
									)}
								>
									{user.role}
								</span>
							</div>
						</div>

						{/* Details */}
						<div className="space-y-2.5 border-t px-5 py-4 text-sm">
							{user.department && (
								<div className="flex items-center gap-2.5 text-muted-foreground">
									<Building className="size-4 shrink-0" />
									<span>{user.department}</span>
								</div>
							)}
							{user.officeLocation && (
								<div className="flex items-center gap-2.5 text-muted-foreground">
									<MapPin className="size-4 shrink-0" />
									<span>{user.officeLocation}</span>
								</div>
							)}
							{user.managerDisplayName && (
								<div className="flex items-center gap-2.5 text-muted-foreground">
									<Users className="size-4 shrink-0" />
									<span>Reports to {user.managerDisplayName}</span>
								</div>
							)}
							<div className="flex items-center gap-2.5 text-muted-foreground">
								<Mail className="size-4 shrink-0" />
								<span className="truncate">{user.email}</span>
							</div>
						</div>

						{/* Idea stats */}
						{user.stats.totalIdeas > 0 && (
							<div className="flex gap-3 border-t px-5 py-3.5">
								<div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
									<Lightbulb className="size-3" />
									{user.stats.totalIdeas} ideas
								</div>
								{user.stats.implemented > 0 && (
									<div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
										<Sparkles className="size-3" />
										{user.stats.implemented} implemented
									</div>
								)}
								{user.stats.open > 0 && (
									<div className="flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
										{user.stats.open} open
									</div>
								)}
							</div>
						)}
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}
