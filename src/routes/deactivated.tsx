import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, LogOut, Send, ShieldX } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "#/components/ui/button";
import { requestAccess } from "#/server/functions/access-request";

const SESSION_KEY = "thoughtbox-access-requested";

export const Route = createFileRoute("/deactivated")({
	component: DeactivatedPage,
});

function DeactivatedPage() {
	const [requested, setRequested] = useState(
		() => typeof window !== "undefined" && sessionStorage.getItem(SESSION_KEY) === "true",
	);
	const [sending, setSending] = useState(false);

	const requestAccessFn = useServerFn(requestAccess);

	const handleRequestAccess = useCallback(async () => {
		setSending(true);
		try {
			await requestAccessFn();
			setRequested(true);
			if (typeof window !== "undefined") {
				sessionStorage.setItem(SESSION_KEY, "true");
			}
		} catch {
			// Still mark as requested — the audit log fires even if email fails
			setRequested(true);
		} finally {
			setSending(false);
		}
	}, [requestAccessFn]);

	return (
		<main className="flex min-h-[80vh] flex-col items-center justify-center px-4 text-center">
			<div className="mb-6 rounded-full bg-amber-100 p-4 dark:bg-amber-900/30">
				<ShieldX className="size-8 text-amber-600 dark:text-amber-400" />
			</div>

			<h1 className="mb-2 text-2xl font-semibold">Account Deactivated</h1>

			<p className="mb-8 max-w-md text-sm text-muted-foreground">
				Your ThoughtBox account has been deactivated. If you believe this is an error, you can
				request access below and an administrator will be notified.
			</p>

			<div className="flex flex-col gap-3 sm:flex-row">
				{requested ? (
					<div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
						<CheckCircle2 className="size-4" />
						Request sent — an administrator has been notified.
					</div>
				) : (
					<Button onClick={handleRequestAccess} disabled={sending}>
						<Send className="mr-2 size-4" />
						{sending ? "Sending..." : "Request Access"}
					</Button>
				)}

				<Button variant="outline" asChild>
					<a href="/.auth/logout">
						<LogOut className="mr-2 size-4" />
						Sign Out
					</a>
				</Button>
			</div>
		</main>
	);
}
