import {
	AssistantRuntimeProvider,
	ComposerPrimitive,
	MessagePrimitive,
	ThreadPrimitive,
	useThread,
	useThreadRuntime,
} from "@assistant-ui/react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk";
import confetti from "canvas-confetti";
import { ArrowUp, ExternalLink, Lightbulb, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import type { AuthUser } from "#/server/middleware/auth";

// ── Tool UI components ─────────────────────────────────────────────────────

const SubmitIdeaToolUI: ToolCallMessagePartComponent = ({ result }) => {
	const confettiFired = useRef(false);
	const data = (
		result as {
			data?: {
				submissionId: string;
				title: string;
				categoryName: string;
				assignedLeaderName: string | null;
			};
		}
	)?.data;

	useEffect(() => {
		if (data && !confettiFired.current) {
			confettiFired.current = true;
			confetti({
				particleCount: 80,
				spread: 60,
				origin: { y: 0.7 },
				colors: ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6"],
			});
		}
	}, [data]);

	if (!data) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="size-4 animate-spin" />
				Submitting your idea...
			</div>
		);
	}

	return (
		<Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-green-700 dark:text-green-300">
					<Lightbulb className="size-5" />
					Idea Submitted!
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2 text-sm">
				<p>
					<span className="font-medium">ID:</span> {data.submissionId}
				</p>
				<p>
					<span className="font-medium">Title:</span> {data.title}
				</p>
				<p>
					<span className="font-medium">Category:</span> {data.categoryName}
				</p>
				{data.assignedLeaderName && (
					<p>
						<span className="font-medium">Reviewer:</span> {data.assignedLeaderName}
					</p>
				)}
			</CardContent>
		</Card>
	);
};

const RedirectToolUI: ToolCallMessagePartComponent = ({ args }) => {
	const typedArgs = args as { categoryName: string; redirectUrl: string; redirectLabel: string };
	return (
		<Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
			<CardContent className="flex items-center justify-between gap-4 p-4">
				<div className="space-y-1">
					<p className="text-sm font-medium">{typedArgs.categoryName}</p>
					<p className="text-xs text-muted-foreground">
						This type of idea has a dedicated intake process.
					</p>
				</div>
				<Button asChild variant="outline" size="sm">
					<a href={typedArgs.redirectUrl} target="_blank" rel="noopener noreferrer">
						{typedArgs.redirectLabel}
						<ExternalLink className="ml-2 size-3" />
					</a>
				</Button>
			</CardContent>
		</Card>
	);
};

// ── Chat thread ────────────────────────────────────────────────────────────

function ChatThread({ suggestedPrompts }: { suggestedPrompts: string[] }) {
	return (
		<div className="flex h-full flex-col">
			<ThreadPrimitive.Root className="flex flex-1 flex-col overflow-hidden">
				<ThreadPrimitive.Viewport className="flex-1 space-y-4 overflow-y-auto p-4">
					<ThreadPrimitive.Messages
						components={{
							UserMessage,
							AssistantMessage,
						}}
					/>
				</ThreadPrimitive.Viewport>

				<SuggestedPrompts prompts={suggestedPrompts} />

				<div className="border-t p-4">
					<ComposerPrimitive.Root className="flex gap-2">
						<ComposerPrimitive.Input
							placeholder="Tell me about your idea..."
							className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							autoFocus
						/>
						<ComposerPrimitive.Send asChild>
							<Button size="icon" aria-label="Send message">
								<ArrowUp className="size-4" />
							</Button>
						</ComposerPrimitive.Send>
					</ComposerPrimitive.Root>
				</div>
			</ThreadPrimitive.Root>
		</div>
	);
}

function UserMessage() {
	return (
		<div className="flex justify-end">
			<div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
				<MessagePrimitive.Content />
			</div>
		</div>
	);
}

function AssistantMessage() {
	return (
		<div className="flex justify-start">
			<div className="max-w-[85%] space-y-2 rounded-2xl bg-muted px-4 py-2.5 text-sm">
				<MessagePrimitive.Content
					components={{
						Text: ({ text }) => <p className="whitespace-pre-wrap">{text}</p>,
						tools: {
							by_name: {
								submit_idea: SubmitIdeaToolUI,
								redirect_to_form: RedirectToolUI,
							},
						},
					}}
				/>
			</div>
		</div>
	);
}

function SuggestedPrompts({ prompts }: { prompts: string[] }) {
	const thread = useThread();
	const threadRuntime = useThreadRuntime();

	if (thread.messages.length > 0 || prompts.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-2 px-4 pb-2">
			{prompts.map((prompt) => (
				<button
					key={prompt}
					type="button"
					onClick={() => {
						threadRuntime.append({
							role: "user",
							content: [{ type: "text", text: prompt }],
						});
					}}
					className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					{prompt}
				</button>
			))}
		</div>
	);
}

// ── Main export ────────────────────────────────────────────────────────────

interface ChatInterfaceProps {
	user: AuthUser;
	suggestedPrompts: string[];
}

export function ChatInterface({ user, suggestedPrompts }: ChatInterfaceProps) {
	const transport = useMemo(
		() =>
			new AssistantChatTransport({
				api: "/api/chat",
				body: { userId: user.id },
			}),
		[user.id],
	);

	const runtime = useChatRuntime({ transport });

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			<ChatThread suggestedPrompts={suggestedPrompts} />
		</AssistantRuntimeProvider>
	);
}
