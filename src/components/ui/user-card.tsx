"use client";

import { useQuery } from "@tanstack/react-query";
import { Building, MapPin, Users } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { Skeleton } from "#/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";
import { getUserCard } from "#/server/functions/users";

// ── Presence ──────────────────────────────────────────────────────────────

const PRESENCE_CONFIG: Record<string, { color: string; label: string }> = {
	Available: { color: "bg-green-500", label: "Available" },
	Busy: { color: "bg-red-500", label: "Busy" },
	InAMeeting: { color: "bg-red-500", label: "In a meeting" },
	DoNotDisturb: { color: "bg-red-500", label: "Do not disturb" },
	Away: { color: "bg-yellow-500", label: "Away" },
	BeRightBack: { color: "bg-yellow-500", label: "Be right back" },
	Offline: { color: "bg-gray-400", label: "Offline" },
	OffWork: { color: "bg-gray-400", label: "Off work" },
	OutOfOffice: { color: "bg-purple-500", label: "Out of office" },
	PresenceUnknown: { color: "bg-gray-400", label: "Unknown" },
	Tentative: { color: "bg-yellow-500", label: "Tentative" },
};

// ── Role styles ───────────────────────────────────────────────────────────

const ROLE_STYLES: Record<string, string> = {
	admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
	leader: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
	submitter: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

// ── Component ─────────────────────────────────────────────────────────────

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
			<PopoverContent className="w-80 p-0" align="start" onClick={(e) => e.stopPropagation()}>
				{isLoading || !user ? (
					<div className="space-y-4 p-5">
						<div className="flex items-center gap-4">
							<Skeleton className="size-14 rounded-full" />
							<div className="space-y-2">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-3 w-24" />
								<Skeleton className="h-5 w-16 rounded-full" />
							</div>
						</div>
						<div className="space-y-2.5">
							<Skeleton className="h-3.5 w-full" />
							<Skeleton className="h-3.5 w-3/4" />
						</div>
					</div>
				) : (
					<>
						{/* Header with avatar + presence */}
						<div className="flex items-start gap-4 p-5 pb-3">
							<div className="relative">
								<Avatar className="size-14">
									{user.photoUrl && (
										<AvatarImage src={user.photoUrl} alt={user.displayName} />
									)}
									<AvatarFallback className="text-base">
										{user.displayName
											.split(" ")
											.map((n) => n[0])
											.join("")
											.slice(0, 2)}
									</AvatarFallback>
								</Avatar>
								{user.presence && PRESENCE_CONFIG[user.presence] && (
									<Tooltip>
										<TooltipTrigger asChild>
											<span
												className={cn(
													"absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-popover",
													PRESENCE_CONFIG[user.presence].color,
												)}
											/>
										</TooltipTrigger>
										<TooltipContent side="bottom" className="text-xs">
											{PRESENCE_CONFIG[user.presence].label}
										</TooltipContent>
									</Tooltip>
								)}
							</div>
							<div className="min-w-0 flex-1">
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

						{/* Action buttons */}
						<div className="flex gap-2 border-t px-5 py-3">
							<a
								href={`mailto:${user.email}`}
								className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
							>
								<svg className="size-4" viewBox="0 0 24 24" fill="none">
									<path d="M22 6.5V17.5C22 18.88 20.88 20 19.5 20H4.5C3.12 20 2 18.88 2 17.5V6.5C2 5.12 3.12 4 4.5 4H19.5C20.88 4 22 5.12 22 6.5Z" fill="#0078D4" />
									<path d="M22 6.5L12 13L2 6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
								</svg>
								Outlook
							</a>
							<a
								href={`https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(user.email)}`}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
							>
								<svg className="size-4" viewBox="0 0 24 24" fill="none">
									<path d="M20.5 7H16V3.5C16 2.67 16.67 2 17.5 2H19C19.83 2 20.5 2.67 20.5 3.5V7Z" fill="#5B5FC7" />
									<path d="M16 7H3.5C2.67 7 2 7.67 2 8.5V18.5C2 19.33 2.67 20 3.5 20H16.5C17.33 20 18 19.33 18 18.5V9C18 7.9 17.1 7 16 7Z" fill="#5B5FC7" />
									<path d="M22 9.5V16.5C22 17.33 21.33 18 20.5 18H18V9C18 7.9 17.1 7 16 7H20.5C21.33 7 22 7.67 22 8.5V9.5Z" fill="#7B83EB" />
									<circle cx="19.5" cy="4.5" r="2" fill="#7B83EB" />
									<path d="M6 13H14M6 16H11" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
								</svg>
								Teams
							</a>
						</div>

						{/* Details */}
						<div className="space-y-2 border-t px-5 py-3.5 text-sm">
							{user.department && (
								<div className="flex items-center gap-2.5 text-muted-foreground">
									<Building className="size-3.5 shrink-0" />
									<span>{user.department}</span>
								</div>
							)}
							{user.officeLocation && (
								<div className="flex items-center gap-2.5 text-muted-foreground">
									<MapPin className="size-3.5 shrink-0" />
									<span>{user.officeLocation}</span>
								</div>
							)}
							{user.managerDisplayName && (
								<div className="flex items-center gap-2.5 text-muted-foreground">
									<Users className="size-3.5 shrink-0" />
									<span>Reports to {user.managerDisplayName}</span>
								</div>
							)}
						</div>

						{/* Idea stats */}
						{user.stats.totalIdeas > 0 && (
							<div className="grid grid-cols-3 border-t text-center">
								<div className="border-r py-3">
									<p className="text-base font-semibold">{user.stats.totalIdeas}</p>
									<p className="text-[11px] text-muted-foreground">Ideas</p>
								</div>
								<div className="border-r py-3">
									<p className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
										{user.stats.implemented}
									</p>
									<p className="text-[11px] text-muted-foreground">Implemented</p>
								</div>
								<div className="py-3">
									<p className="text-base font-semibold text-blue-600 dark:text-blue-400">
										{user.stats.open}
									</p>
									<p className="text-[11px] text-muted-foreground">Open</p>
								</div>
							</div>
						)}
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}
