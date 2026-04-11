"use client";

import { useQuery } from "@tanstack/react-query";
import { Building, Lightbulb, Mail, MapPin, Sparkles, UserCheck, Users } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { Skeleton } from "#/components/ui/skeleton";
import { getUserCard } from "#/server/functions/users";

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
			<PopoverContent className="w-72 p-0" align="start">
				{isLoading || !user ? (
					<div className="space-y-3 p-4">
						<div className="flex items-center gap-3">
							<Skeleton className="size-10 rounded-full" />
							<div className="space-y-1.5">
								<Skeleton className="h-4 w-28" />
								<Skeleton className="h-3 w-20" />
							</div>
						</div>
						<Skeleton className="h-3 w-full" />
						<Skeleton className="h-3 w-3/4" />
					</div>
				) : (
					<>
						{/* Header */}
						<div className="flex items-center gap-3 border-b p-4">
							<Avatar className="size-10">
								{user.photoUrl && (
									<AvatarImage src={user.photoUrl} alt={user.displayName} />
								)}
								<AvatarFallback>
									{user.displayName
										.split(" ")
										.map((n) => n[0])
										.join("")
										.slice(0, 2)}
								</AvatarFallback>
							</Avatar>
							<div className="min-w-0">
								<p className="font-medium leading-none">{user.displayName}</p>
								<Badge variant="outline" className="mt-1 text-[10px] capitalize">
									{user.role}
								</Badge>
							</div>
						</div>

						{/* Details */}
						<div className="space-y-2 p-4 text-sm">
							{user.jobTitle && (
								<div className="flex items-center gap-2 text-muted-foreground">
									<UserCheck className="size-3.5 shrink-0" />
									<span className="truncate">{user.jobTitle}</span>
								</div>
							)}
							{user.department && (
								<div className="flex items-center gap-2 text-muted-foreground">
									<Building className="size-3.5 shrink-0" />
									<span className="truncate">{user.department}</span>
								</div>
							)}
							{user.officeLocation && (
								<div className="flex items-center gap-2 text-muted-foreground">
									<MapPin className="size-3.5 shrink-0" />
									<span className="truncate">{user.officeLocation}</span>
								</div>
							)}
							{user.managerDisplayName && (
								<div className="flex items-center gap-2 text-muted-foreground">
									<Users className="size-3.5 shrink-0" />
									<span className="truncate">{user.managerDisplayName}</span>
								</div>
							)}
							<div className="flex items-center gap-2 text-muted-foreground">
								<Mail className="size-3.5 shrink-0" />
								<span className="truncate">{user.email}</span>
							</div>
						</div>

						{/* Idea stats */}
						{user.stats.totalIdeas > 0 && (
							<div className="flex items-center gap-4 border-t px-4 py-3 text-xs text-muted-foreground">
								<span className="flex items-center gap-1">
									<Lightbulb className="size-3" />
									{user.stats.totalIdeas} ideas
								</span>
								{user.stats.implemented > 0 && (
									<span className="flex items-center gap-1">
										<Sparkles className="size-3" />
										{user.stats.implemented} implemented
									</span>
								)}
								{user.stats.open > 0 && (
									<span>{user.stats.open} open</span>
								)}
							</div>
						)}
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}
