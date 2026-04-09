import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { getSettings, updateSetting } from "#/server/functions/settings";

export const Route = createFileRoute("/admin/settings")({
	beforeLoad: ({ context }) => {
		if (context.user.role !== "admin") {
			throw redirect({ to: "/dashboard" });
		}
	},
	loader: () => getSettings(),
	component: SettingsPage,
});

function SettingsPage() {
	const initialSettings = Route.useLoaderData();
	const queryClient = useQueryClient();

	const { data: settings = initialSettings } = useQuery({
		queryKey: ["admin-settings"],
		queryFn: () => getSettings(),
		initialData: initialSettings,
	});

	return (
		<main className="flex-1 bg-background p-6">
			<div className="mb-6">
				<h1 className="text-2xl font-bold tracking-tight">Settings</h1>
				<p className="text-muted-foreground">
					Configure AI behavior, SLA thresholds, and display settings.
				</p>
			</div>

			<div className="space-y-6">
				<SystemPromptSetting value={settings.system_prompt ?? ""} queryClient={queryClient} />
				<SuggestedPromptsSetting
					value={settings.suggested_prompts ?? "[]"}
					queryClient={queryClient}
				/>
				<NumberSetting
					settingKey="sla_business_days"
					title="SLA Business Days"
					description="Number of business days for the initial review SLA deadline."
					value={settings.sla_business_days ?? "15"}
					queryClient={queryClient}
				/>
				<NumberSetting
					settingKey="social_proof_min_threshold"
					title="Social Proof Threshold"
					description="Minimum number of ideas this month before showing the social proof strip on the landing page."
					value={settings.social_proof_min_threshold ?? "5"}
					queryClient={queryClient}
				/>
			</div>
		</main>
	);
}

function SystemPromptSetting({
	value,
	queryClient,
}: { value: string; queryClient: ReturnType<typeof useQueryClient> }) {
	const [draft, setDraft] = useState(value);
	const saveFn = useServerFn(updateSetting);

	const mutation = useMutation({
		mutationFn: () => saveFn({ data: { key: "system_prompt", value: draft } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
			toast.success("System prompt saved");
		},
		onError: () => toast.error("Failed to save"),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>System Prompt</CardTitle>
				<CardDescription>
					The AI assistant's instructions. Changes take effect on the next conversation.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<Textarea
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					className="min-h-[200px] font-mono text-sm"
				/>
				<Button
					onClick={() => mutation.mutate()}
					disabled={draft === value || mutation.isPending}
					variant="outline"
				>
					<Check className="mr-2 size-4" />
					{mutation.isPending ? "Saving..." : "Save System Prompt"}
				</Button>
			</CardContent>
		</Card>
	);
}

function SuggestedPromptsSetting({
	value,
	queryClient,
}: { value: string; queryClient: ReturnType<typeof useQueryClient> }) {
	let prompts: string[] = [];
	try {
		prompts = JSON.parse(value);
	} catch {
		prompts = [];
	}

	const originalDraft = prompts.join("\n");
	const [draft, setDraft] = useState(originalDraft);
	const saveFn = useServerFn(updateSetting);
	const isDirty = draft !== originalDraft;

	const mutation = useMutation({
		mutationFn: () => {
			const lines = draft
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);
			return saveFn({ data: { key: "suggested_prompts", value: JSON.stringify(lines) } });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
			toast.success("Suggested prompts saved");
		},
		onError: () => toast.error("Failed to save"),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Suggested Prompts</CardTitle>
				<CardDescription>Prompt pills shown below the chat input. One per line.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<Textarea
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					className="min-h-[100px]"
					placeholder="I have an idea to save time on..."
				/>
				<Button
					onClick={() => mutation.mutate()}
					disabled={!isDirty || mutation.isPending}
					variant="outline"
				>
					<Check className="mr-2 size-4" />
					{mutation.isPending ? "Saving..." : "Save Prompts"}
				</Button>
			</CardContent>
		</Card>
	);
}

function NumberSetting({
	settingKey,
	title,
	description,
	value,
	queryClient,
}: {
	settingKey: string;
	title: string;
	description: string;
	value: string;
	queryClient: ReturnType<typeof useQueryClient>;
}) {
	const [draft, setDraft] = useState(value);
	const saveFn = useServerFn(updateSetting);

	const mutation = useMutation({
		mutationFn: () => saveFn({ data: { key: settingKey, value: draft } }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
			toast.success(`${title} saved`);
		},
		onError: () => toast.error("Failed to save"),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex items-center gap-3">
					<Input
						type="number"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						className="w-[120px]"
					/>
					<Button
						onClick={() => mutation.mutate()}
						disabled={draft === value || mutation.isPending}
						variant="outline"
						size="sm"
					>
						<Check className="mr-2 size-4" />
						{mutation.isPending ? "Saving..." : "Save"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
