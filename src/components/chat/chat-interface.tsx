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
import { Link } from "@tanstack/react-router";
import confetti from "canvas-confetti";
import { ArrowRight, ArrowUp, ExternalLink, Lightbulb, Loader2 } from "lucide-react";
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
				<Button asChild variant="outline" size="sm" className="mt-2 w-full">
					<Link to="/ideas/$submissionId" params={{ submissionId: data.submissionId }}>
						View Idea
						<ArrowRight className="ml-2 size-3.5" />
					</Link>
				</Button>
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

function ChatThread({
	suggestedPrompts,
	onFirstMessage,
	compact,
	initialPrompt,
}: {
	suggestedPrompts: string[];
	onFirstMessage?: () => void;
	compact?: boolean;
	initialPrompt?: string | null;
}) {
	const thread = useThread();
	const threadRuntime = useThreadRuntime();
	const hasMessages = thread.messages.length > 0;
	const firedRef = useRef(false);
	const promptSentRef = useRef(false);

	// Send initial prompt from landing page card click
	useEffect(() => {
		if (initialPrompt && !promptSentRef.current) {
			promptSentRef.current = true;
			threadRuntime.append({
				role: "user",
				content: [{ type: "text", text: initialPrompt }],
			});
		}
	}, [initialPrompt, threadRuntime]);

	useEffect(() => {
		if (hasMessages && !firedRef.current && onFirstMessage) {
			firedRef.current = true;
			onFirstMessage();
		}
	}, [hasMessages, onFirstMessage]);

	return (
		<div className={compact ? "flex flex-col" : "flex h-full flex-col"}>
			<ThreadPrimitive.Root
				className={compact ? "flex flex-col" : "flex flex-1 flex-col overflow-hidden"}
			>
				{!compact && (
					<ThreadPrimitive.Viewport className="flex-1 space-y-4 overflow-y-auto p-4">
						<ThreadPrimitive.Messages
							components={{
								UserMessage,
								AssistantMessage,
							}}
						/>
					</ThreadPrimitive.Viewport>
				)}

				{!compact && <SuggestedPrompts prompts={suggestedPrompts} />}

				<div className={compact ? "p-3" : "border-t p-4"}>
					<ComposerPrimitive.Root className="flex items-end gap-2">
						<ComposerPrimitive.Input
							placeholder={compact ? "Describe your idea here..." : "Tell me about your idea..."}
							className={`flex-1 resize-none rounded-lg border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${compact ? "h-[72px] min-h-[72px] max-h-[72px]" : ""}`}
							autoFocus
						/>
						<ComposerPrimitive.Send asChild>
							<Button size="icon" className="shrink-0" aria-label="Send message">
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
						Text: ({ text }) => <div className="whitespace-pre-wrap">{parseMarkdown(text)}</div>,
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

// ── Simple markdown parser ─────────────────────────────────────────────────

function parseMarkdown(text: string): React.ReactNode[] {
	// Split into lines, then process inline formatting
	return text.split("\n").flatMap((line, lineIdx, lines) => {
		const nodes: React.ReactNode[] = [];
		const key = `l-${lineIdx}-${line.slice(0, 20)}`;

		// Headings (### text)
		const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
		if (headingMatch) {
			nodes.push(
				<p key={key} className="font-semibold">
					{parseInline(headingMatch[2])}
				</p>,
			);
		}
		// Bullet points (- text or * text)
		else if (/^[-*]\s+/.test(line)) {
			nodes.push(
				<p key={key} className="ml-3">
					{"• "}
					{parseInline(line.replace(/^[-*]\s+/, ""))}
				</p>,
			);
		}
		// Numbered lists (1. text)
		else if (/^\d+\.\s+/.test(line)) {
			const num = line.match(/^(\d+)\.\s+/);
			nodes.push(
				<p key={key} className="ml-3">
					{num?.[1]}. {parseInline(line.replace(/^\d+\.\s+/, ""))}
				</p>,
			);
		}
		// Regular text
		else {
			nodes.push(<span key={key}>{parseInline(line)}</span>);
		}

		// Add newline between lines (except last)
		if (lineIdx < lines.length - 1) {
			nodes.push("\n");
		}

		return nodes;
	});
}

function parseInline(text: string): React.ReactNode[] {
	const parts: React.ReactNode[] = [];
	// Match **bold** and *italic*
	const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	match = regex.exec(text);
	while (match !== null) {
		if (match.index > lastIndex) {
			parts.push(text.slice(lastIndex, match.index));
		}
		if (match[2]) {
			// Bold
			parts.push(<strong key={match.index}>{match[2]}</strong>);
		} else if (match[3]) {
			// Italic
			parts.push(<em key={match.index}>{match[3]}</em>);
		}
		lastIndex = match.index + match[0].length;
		match = regex.exec(text);
	}

	if (lastIndex < text.length) {
		parts.push(text.slice(lastIndex));
	}

	return parts.length > 0 ? parts : [text];
}

// ── Main export ────────────────────────────────────────────────────────────

interface ChatInterfaceProps {
	user: AuthUser;
	suggestedPrompts: string[];
	onFirstMessage?: () => void;
	compact?: boolean;
	initialPrompt?: string | null;
}

export function ChatInterface({
	user,
	suggestedPrompts,
	onFirstMessage,
	compact,
	initialPrompt,
}: ChatInterfaceProps) {
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
			<ChatThread
				suggestedPrompts={suggestedPrompts}
				onFirstMessage={onFirstMessage}
				compact={compact}
				initialPrompt={initialPrompt}
			/>
		</AssistantRuntimeProvider>
	);
}
