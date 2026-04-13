import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { RouteError } from "#/components/ui/route-error";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { sendTestEmail } from "#/server/functions/email";
import type { TestEmailTemplate } from "#/server/functions/email";
import { getSettings, updateSetting } from "#/server/functions/settings";

export const Route = createFileRoute("/admin/settings")({
	errorComponent: ({ error }) => <RouteError error={error} />,
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
				<TextSetting
					settingKey="watcher_email"
					title="System Notifications"
					description="Send new idea alerts to this email or distribution list. Leave blank to disable."
					placeholder="thoughtbox-admins@desertfinancial.com"
					value={settings.watcher_email ?? ""}
					queryClient={queryClient}
				/>
				<NumberSetting
					settingKey="sla_business_days"
					title="SLA Business Days"
					description="Number of business days for the initial review SLA deadline."
					value={settings.sla_business_days ?? "15"}
					queryClient={queryClient}
				/>
				<Card>
					<CardHeader>
						<CardTitle>SLA Reminders</CardTitle>
						<CardDescription>
							Automated email reminders sent to assigned leaders when ideas are overdue.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<NumberSetting
							settingKey="sla_new_first_reminder_days"
							title="First Reminder (New)"
							description="Days after submission to send first reminder when status is still New."
							value={settings.sla_new_first_reminder_days ?? "5"}
							queryClient={queryClient}
							inline
						/>
						<NumberSetting
							settingKey="sla_new_second_reminder_days"
							title="Second Reminder (New)"
							description="Days after submission to send second reminder when status is still New."
							value={settings.sla_new_second_reminder_days ?? "14"}
							queryClient={queryClient}
							inline
						/>
						<NumberSetting
							settingKey="sla_review_reminder_days"
							title="Reminder (Under Review)"
							description="Days after submission to remind when status is still Under Review."
							value={settings.sla_review_reminder_days ?? "30"}
							queryClient={queryClient}
							inline
						/>
					</CardContent>
				</Card>
				<NumberSetting
					settingKey="social_proof_min_threshold"
					title="Social Proof Threshold"
					description="Minimum number of ideas this month before showing the social proof strip on the landing page."
					value={settings.social_proof_min_threshold ?? "5"}
					queryClient={queryClient}
				/>
				<TestEmailSetting />
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
	inline,
}: {
	settingKey: string;
	title: string;
	description: string;
	value: string;
	queryClient: ReturnType<typeof useQueryClient>;
	inline?: boolean;
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

	const content = (
		<div className="flex items-center gap-3">
			{inline && (
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium">{title}</p>
					<p className="text-xs text-muted-foreground">{description}</p>
				</div>
			)}
			<Input
				type="number"
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				className="w-[80px]"
			/>
			<span className="text-xs text-muted-foreground">days</span>
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
	);

	if (inline) return content;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>{content}</CardContent>
		</Card>
	);
}

function TextSetting({
	settingKey,
	title,
	description,
	placeholder,
	value,
	queryClient,
}: {
	settingKey: string;
	title: string;
	description: string;
	placeholder?: string;
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
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						placeholder={placeholder}
						className="max-w-sm"
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

const EMAIL_TEMPLATE_OPTIONS: { value: TestEmailTemplate; label: string }[] = [
	{ value: "idea_submitted", label: "Idea Submitted (to submitter)" },
	{ value: "idea_assigned", label: "Idea Assigned (to leader)" },
	{ value: "status_under_review", label: "Status: Under Review" },
	{ value: "status_accepted", label: "Status: Accepted" },
	{ value: "status_declined", label: "Status: Declined" },
	{ value: "idea_reassigned", label: "Idea Reassigned" },
	{ value: "message_from_leader", label: "Message from Leader" },
	{ value: "message_from_submitter", label: "Message from Submitter" },
	{ value: "sla_reminder", label: "SLA Reminder" },
	{ value: "watcher_alert", label: "System Notification (new submission)" },
	{ value: "user_invite_leader", label: "Invite (Leader)" },
	{ value: "user_invite_admin", label: "Invite (Admin)" },
	{ value: "access_requested", label: "Access Requested" },
];

function TestEmailSetting() {
	const [template, setTemplate] = useState<TestEmailTemplate>("idea_submitted");
	const sendFn = useServerFn(sendTestEmail);

	const mutation = useMutation({
		mutationFn: () => sendFn({ data: { template } }),
		onSuccess: (result) => {
			toast.success(`Test email sent to ${result.sentTo}`);
		},
		onError: (err) => toast.error(err.message || "Failed to send test email"),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Test Email</CardTitle>
				<CardDescription>
					Send a test email to your account to verify email delivery and template rendering.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex items-center gap-3">
					<Select value={template} onValueChange={(v) => setTemplate(v as TestEmailTemplate)}>
						<SelectTrigger className="w-[280px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{EMAIL_TEMPLATE_OPTIONS.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button onClick={() => mutation.mutate()} disabled={mutation.isPending} variant="outline">
						<Mail className="mr-2 size-4" />
						{mutation.isPending ? "Sending..." : "Send Test"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
