import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover";
import { cn, initials } from "#/lib/utils";
import { getDevPersonas } from "#/server/functions/dev";

interface ActingAs {
	realDisplayName: string;
	realEmail: string;
}

/** Effective roles and persona intents share this vocabulary, so one map colors both. */
const ROLE_COLOR: Record<string, string> = {
	admin: "text-purple-600 dark:text-purple-400",
	owner: "text-blue-600 dark:text-blue-400",
	contributor: "text-amber-600 dark:text-amber-400",
	submitter: "text-green-600 dark:text-green-400",
};

interface MenuUser {
	entraId: string;
	displayName: string;
	role: string;
	photoUrl: string | null;
}

/**
 * The sidebar-footer identity surface. Shows who you are and — when the session
 * is allowed to switch (`canSwitchPersona`: local dev, or a deployed dev env
 * where the REAL signed-in user is an admin) — opens a persona menu upward. When
 * an admin is impersonating, the trigger and avatar carry an amber treatment so
 * it's unmistakable you're not in your own identity.
 *
 * The identity override itself is admin-gated server-side, so a forged cookie
 * from a non-admin is a silent no-op.
 */
export function SidebarUserMenu({
	user,
	actingAs,
}: {
	user: MenuUser;
	actingAs?: ActingAs | null;
}) {
	const [open, setOpen] = useState(false);
	const [switching, setSwitching] = useState(false);
	const impersonating = Boolean(actingAs);

	// Prefetch on mount (not gated on open) so the menu is populated before the
	// click — the list call is otherwise cold and pays for materializing personas.
	const { data: personas = [] } = useQuery({
		queryKey: ["dev-personas"],
		queryFn: () => getDevPersonas(),
		staleTime: 5 * 60_000,
	});

	function switchTo(entraId: string | null) {
		setSwitching(true);
		setOpen(false);
		if (entraId) {
			document.cookie = `dev_persona=${encodeURIComponent(entraId)}; path=/; max-age=${60 * 60 * 24 * 30}`;
		} else {
			document.cookie = "dev_persona=; path=/; max-age=0";
		}
		// Full navigation home so SSR re-resolves the user and we land on a page the
		// new role can actually see.
		window.location.href = "/";
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={switching}
					title="Switch persona (test only)"
					className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-2 text-left transition-colors hover:bg-sidebar-accent"
				>
					<Avatar className={cn("size-8 shrink-0", impersonating && "ring-2 ring-amber-400/70")}>
						{user.photoUrl && <AvatarImage src={user.photoUrl} alt={user.displayName} />}
						<AvatarFallback className="text-xs">{initials(user.displayName)}</AvatarFallback>
					</Avatar>
					<div className="flex min-w-0 flex-1 flex-col">
						<span className="truncate text-sm font-medium leading-tight">{user.displayName}</span>
						{impersonating ? (
							<span className="truncate text-xs font-medium leading-tight text-amber-600 dark:text-amber-400">
								Impersonating
							</span>
						) : (
							<span
								className={cn("truncate text-xs capitalize leading-tight", ROLE_COLOR[user.role])}
							>
								{user.role}
							</span>
						)}
					</div>
					{switching ? (
						<Loader2 className="ml-1 size-4 shrink-0 animate-spin opacity-60" />
					) : (
						<ChevronsUpDown className="ml-1 size-4 shrink-0 opacity-50" />
					)}
				</button>
			</PopoverTrigger>

			<PopoverContent
				side="top"
				align="start"
				sideOffset={8}
				className="w-64 gap-0 overflow-hidden p-0"
			>
				<div className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
					Switch persona <span className="font-normal opacity-70">· test only</span>
				</div>

				{actingAs && (
					<div className="flex items-center gap-2 border-b bg-amber-500/10 px-3 py-2 text-xs">
						<span className="min-w-0 flex-1 text-amber-700 dark:text-amber-300">
							Acting as <span className="font-medium">{user.displayName}</span> · you are{" "}
							<span className="font-medium">{actingAs.realDisplayName}</span>
						</span>
						<button
							type="button"
							onClick={() => switchTo(null)}
							className="flex shrink-0 items-center gap-1 rounded-md border border-amber-500/30 px-2 py-1 font-medium text-amber-700 transition-colors hover:bg-amber-500/15 dark:text-amber-300"
						>
							<RotateCcw className="size-3" /> Back to me
						</button>
					</div>
				)}

				<ul className="max-h-[60vh] overflow-y-auto py-1">
					{personas.map((p) => {
						const isCurrent = p.entraId === user.entraId;
						return (
							<li key={p.entraId}>
								<button
									type="button"
									onClick={() => switchTo(p.entraId)}
									className={cn(
										"flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted",
										isCurrent && "bg-muted/50",
									)}
								>
									<Avatar className="mt-0.5 size-6 shrink-0">
										<AvatarFallback className={cn("text-[10px]", ROLE_COLOR[p.intent])}>
											{initials(p.displayName)}
										</AvatarFallback>
									</Avatar>
									<span className="min-w-0 flex-1">
										<span className="flex items-center gap-1.5 font-medium">
											{p.displayName}
											<span className={cn("text-xs capitalize", ROLE_COLOR[p.intent])}>
												· {p.intent}
											</span>
											{isCurrent && <Check className="size-3.5 text-foreground" />}
										</span>
										<span className="block text-xs text-muted-foreground">{p.blurb}</span>
										{p.categoryName && (
											<span className="block text-xs text-muted-foreground">
												Category: {p.categoryName}
											</span>
										)}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</PopoverContent>
		</Popover>
	);
}
