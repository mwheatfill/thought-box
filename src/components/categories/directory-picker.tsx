import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Input } from "#/components/ui/input";
import { searchRosterDirectory } from "#/server/functions/category-team";

export interface DirectoryResult {
	entraId: string;
	displayName: string;
	email: string;
	jobTitle: string | null;
	department: string | null;
	officeLocation: string | null;
}

/**
 * Entra directory search box. Calls the owner-accessible `searchRosterDirectory`
 * and surfaces matches; selecting one hands the full record up so the caller can
 * inline-create + add (roster) or transfer ownership. Shared by both flows.
 */
export function DirectoryPicker({
	placeholder = "Search the directory…",
	excludeEntraIds,
	onSelect,
}: {
	placeholder?: string;
	excludeEntraIds?: Set<string>;
	onSelect: (user: DirectoryResult) => void;
}) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<DirectoryResult[]>([]);
	const search = useServerFn(searchRosterDirectory);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const searchMutation = useMutation({
		mutationFn: (q: string) => search({ data: { query: q } }),
		onSuccess: (data) => setResults(data),
	});

	const onChange = useCallback(
		(value: string) => {
			setQuery(value);
			if (timer.current) clearTimeout(timer.current);
			if (value.trim().length < 2) {
				setResults([]);
				return;
			}
			timer.current = setTimeout(() => searchMutation.mutate(value.trim()), 300);
		},
		[searchMutation],
	);

	const visible = results.filter((r) => !excludeEntraIds?.has(r.entraId));

	return (
		<div className="space-y-2">
			<div className="relative">
				<Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={query}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					className="pl-8"
				/>
			</div>
			{visible.length > 0 && (
				<ul className="max-h-56 overflow-y-auto rounded-md border">
					{visible.map((r) => (
						<li key={r.entraId}>
							<button
								type="button"
								onClick={() => {
									onSelect(r);
									setQuery("");
									setResults([]);
								}}
								className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
							>
								<span className="font-medium">{r.displayName}</span>
								<span className="text-xs text-muted-foreground">
									{[r.jobTitle, r.department].filter(Boolean).join(" · ") || r.email}
								</span>
							</button>
						</li>
					))}
				</ul>
			)}
			{searchMutation.isPending && <p className="text-xs text-muted-foreground">Searching…</p>}
		</div>
	);
}
