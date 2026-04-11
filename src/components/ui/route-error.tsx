import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, RefreshCw, SearchX } from "lucide-react";
import { Button } from "#/components/ui/button";

interface RouteErrorProps {
	error: Error;
	variant?: "generic" | "not-found";
}

export function RouteError({ error, variant = "generic" }: RouteErrorProps) {
	const router = useRouter();
	const isNotFound = variant === "not-found" || error.message.includes("Not found");

	const goBack = () => {
		if (window.history.length > 1) {
			router.history.back();
		} else {
			window.location.href = "/";
		}
	};

	if (isNotFound) {
		return (
			<main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
				<div className="mb-4 rounded-full bg-muted p-4">
					<SearchX className="size-8 text-muted-foreground" />
				</div>
				<h2 className="mb-2 text-xl font-semibold">Not found</h2>
				<p className="mb-6 max-w-md text-sm text-muted-foreground">
					This page doesn't exist or you don't have access to it.
				</p>
				<Button variant="outline" onClick={goBack}>
					<ArrowLeft className="mr-2 size-4" />
					Go back
				</Button>
			</main>
		);
	}

	return (
		<main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
			<div className="mb-4 rounded-full bg-muted p-4">
				<AlertTriangle className="size-8 text-muted-foreground" />
			</div>
			<h2 className="mb-2 text-xl font-semibold">Something went wrong</h2>
			<p className="mb-6 max-w-md text-sm text-muted-foreground">
				An unexpected error occurred. Try refreshing, or go back to where you were.
			</p>
			<div className="flex gap-3">
				<Button variant="outline" onClick={() => window.location.reload()}>
					<RefreshCw className="mr-2 size-4" />
					Refresh
				</Button>
				<Button onClick={goBack}>
					<ArrowLeft className="mr-2 size-4" />
					Go back
				</Button>
			</div>
		</main>
	);
}
