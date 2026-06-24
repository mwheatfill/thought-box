import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Boxes, FileText, Users2 } from "lucide-react";
import { useState } from "react";
import { CategoryTeamSheet } from "#/components/categories/category-team-sheet";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { getMyCategories } from "#/server/functions/category-team";

export const Route = createFileRoute("/my-categories")({
	loader: () => getMyCategories(),
	component: MyCategoriesPage,
});

function MyCategoriesPage() {
	const categories = Route.useLoaderData();
	const router = useRouter();
	const [activeId, setActiveId] = useState<string | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);

	const manage = (id: string) => {
		setActiveId(id);
		setSheetOpen(true);
	};

	return (
		<main className="min-w-0 p-6">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">My Categories</h1>
				<p className="text-sm text-muted-foreground">
					Categories you own. Manage your review team and hand off ownership.
				</p>
			</div>

			{categories.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center gap-2 py-16 text-center">
						<Boxes className="size-10 text-muted-foreground" />
						<p className="text-sm font-medium">You don't own any categories yet</p>
						<p className="max-w-sm text-sm text-muted-foreground">
							An admin assigns category ownership. Once you own one, you can build a review team
							here.
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{categories.map((c) => (
						<Card key={c.id} className="flex flex-col">
							<CardHeader className="pb-3">
								<div className="flex items-start justify-between gap-2">
									<CardTitle className="text-base">{c.name}</CardTitle>
									{!c.active && <Badge variant="outline">Inactive</Badge>}
								</div>
								<p className="line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
							</CardHeader>
							<CardContent className="mt-auto space-y-3">
								<div className="flex gap-4 text-sm text-muted-foreground">
									<span className="flex items-center gap-1.5">
										<FileText className="size-4" /> {c.openIdeaCount} open
									</span>
									<span className="flex items-center gap-1.5">
										<Users2 className="size-4" /> {c.contributorCount}{" "}
										{c.contributorCount === 1 ? "contributor" : "contributors"}
									</span>
								</div>
								<Button variant="outline" size="sm" className="w-full" onClick={() => manage(c.id)}>
									Manage team
								</Button>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			<CategoryTeamSheet
				categoryId={activeId}
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				onChanged={() => router.invalidate()}
			/>
		</main>
	);
}
