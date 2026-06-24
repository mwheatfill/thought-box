import { useQuery } from "@tanstack/react-query";
import { Check, UserCog } from "lucide-react";
import { useState } from "react";
import { getDevPersonas } from "#/server/functions/dev";

const INTENT_COLOR: Record<string, string> = {
	admin: "text-purple-600 dark:text-purple-400",
	owner: "text-blue-600 dark:text-blue-400",
	contributor: "text-amber-600 dark:text-amber-400",
	submitter: "text-green-600 dark:text-green-400",
};

function switchTo(entraId: string | null) {
	if (entraId) {
		document.cookie = `dev_persona=${encodeURIComponent(entraId)}; path=/; max-age=${60 * 60 * 24 * 30}`;
	} else {
		document.cookie = "dev_persona=; path=/; max-age=0";
	}
	// Full navigation home so SSR re-resolves the user and we land on a page the
	// new role can actually see.
	window.location.href = "/";
}

/**
 * Dev-only floating widget to switch the active user across roles without
 * editing `.env` or restarting. Rendered only under `import.meta.env.DEV`, so it
 * is compiled out of production builds entirely.
 */
export function PersonaSwitcher({ currentEntraId }: { currentEntraId?: string }) {
	const [open, setOpen] = useState(false);
	const { data: personas = [] } = useQuery({
		queryKey: ["dev-personas"],
		queryFn: () => getDevPersonas(),
		enabled: open,
		staleTime: 60_000,
	});

	const current = personas.find((p) => p.entraId === currentEntraId);

	return (
		<div className="fixed bottom-4 left-4 z-50 text-sm">
			{open && (
				<div className="mb-2 w-72 overflow-hidden rounded-lg border bg-popover shadow-lg">
					<div className="border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
						Switch persona (dev only)
					</div>
					<ul>
						{personas.map((p) => (
							<li key={p.entraId}>
								<button
									type="button"
									onClick={() => switchTo(p.entraId)}
									className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted"
								>
									<UserCog className={`mt-0.5 size-4 shrink-0 ${INTENT_COLOR[p.intent] ?? ""}`} />
									<span className="min-w-0 flex-1">
										<span className="flex items-center gap-1.5 font-medium">
											{p.displayName}
											<span className={`text-xs capitalize ${INTENT_COLOR[p.intent] ?? ""}`}>
												· {p.intent}
											</span>
											{p.entraId === currentEntraId && (
												<Check className="size-3.5 text-foreground" />
											)}
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
						))}
					</ul>
				</div>
			)}
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 font-medium shadow-md hover:bg-muted"
				title="Dev persona switcher"
			>
				<UserCog className={`size-4 ${current ? INTENT_COLOR[current.intent] : ""}`} />
				{current ? `${current.displayName} · ${current.intent}` : "Switch persona"}
			</button>
		</div>
	);
}
