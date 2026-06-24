"use client";

import { useQuery } from "@tanstack/react-query";
import { Building, MapPin, MessageSquare, Users } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { Skeleton } from "#/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { cn, initials } from "#/lib/utils";
import { getUserCard } from "#/server/functions/users";

// ── Presence ──────────────────────────────────────────────────────────────

const PRESENCE_CONFIG: Record<string, { color: string; label: string; icon?: React.ReactNode }> = {
	Available: { color: "bg-green-500", label: "Available" },
	Busy: { color: "bg-red-500", label: "Busy" },
	InAMeeting: { color: "bg-red-500", label: "In a meeting" },
	DoNotDisturb: {
		color: "bg-red-500",
		label: "Do not disturb",
		icon: <rect x="3" y="6.5" width="8" height="1.5" rx="0.75" fill="white" />,
	},
	Away: { color: "bg-yellow-500", label: "Away" },
	BeRightBack: { color: "bg-yellow-500", label: "Be right back" },
	Offline: {
		color: "bg-gray-400",
		label: "Offline",
		icon: <path d="M5 5l4 4M9 5l-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />,
	},
	OffWork: {
		color: "bg-gray-400",
		label: "Off work",
		icon: <path d="M5 5l4 4M9 5l-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />,
	},
	OutOfOffice: { color: "bg-purple-500", label: "Out of office" },
	PresenceUnknown: { color: "bg-gray-400", label: "Unknown" },
	Tentative: {
		color: "bg-yellow-500",
		label: "Tentative",
		icon: <><circle cx="7" cy="7" r="3.5" stroke="white" strokeWidth="1.5" fill="none" /><path d="M7 5v2.5l1.5 1" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" /></>,
	},
};

// ── Role styles ───────────────────────────────────────────────────────────

const ROLE_STYLES: Record<string, string> = {
	admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
	owner: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
	submitter: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

// ── Component ─────────────────────────────────────────────────────────────

interface UserCardPopoverProps {
	userId: string;
	children: ReactNode;
	/**
	 * When provided, renders a "Message" button in the card that closes the
	 * popover and invokes this callback (e.g., jump to the idea composer).
	 */
	onMessage?: () => void;
}

export function UserCardPopover({ userId, children, onMessage }: UserCardPopoverProps) {
	const [open, setOpen] = useState(false);
	// When the Message button closes the popover, stop Radix from returning
	// focus to the trigger so the composer focus (onMessage) wins the race.
	const messageRequestedRef = useRef(false);

	const { data: user, isLoading } = useQuery({
		queryKey: ["user-card", userId],
		queryFn: () => getUserCard({ data: { userId } }),
		enabled: open,
		staleTime: 60_000,
	});

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent
				className="w-80 p-0"
				align="start"
				onClick={(e) => e.stopPropagation()}
				onCloseAutoFocus={(e) => {
					if (messageRequestedRef.current) {
						e.preventDefault();
						messageRequestedRef.current = false;
					}
				}}
			>
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
										{initials(user.displayName)}
									</AvatarFallback>
								</Avatar>
								{user.presence && PRESENCE_CONFIG[user.presence] && (() => {
									const p = PRESENCE_CONFIG[user.presence];
									return (
										<Tooltip>
											<TooltipTrigger asChild>
												{p.icon ? (
													<span className={cn("absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border-2 border-popover", p.color)}>
														<svg viewBox="0 0 14 14" className="size-2.5">{p.icon}</svg>
													</span>
												) : (
													<span className={cn("absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-popover", p.color)} />
												)}
											</TooltipTrigger>
											<TooltipContent side="bottom" className="text-xs">{p.label}</TooltipContent>
										</Tooltip>
									);
								})()}
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

						{onMessage && (
						<div className="flex border-t px-5 py-3">
							<button
								type="button"
								onClick={() => {
									messageRequestedRef.current = true;
									setOpen(false);
									onMessage();
								}}
								className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
							>
								<MessageSquare className="size-4" />
								Message
							</button>
						</div>
					)}

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
									<p className="text-base font-semibold text-green-600 dark:text-green-400">
										{user.stats.accepted}
									</p>
									<p className="text-[11px] text-muted-foreground">Accepted</p>
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
