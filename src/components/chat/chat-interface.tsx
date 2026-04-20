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
import {
	ArrowRight,
	ArrowUp,
	Check,
	ExternalLink,
	Lightbulb,
	Loader2,
	RotateCcw,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { DropZone } from "#/components/ui/drop-zone";
import { cn } from "#/lib/utils";
import type { AuthUser } from "#/server/middleware/auth";

const ChatUserContext = createContext<string>("");

// ── Tool UI components ─────────────────────────────────────────────────────

const SubmitIdeaToolUI: ToolCallMessagePartComponent = ({ result }) => {
	const userId = useContext(ChatUserContext);
	const confettiFired = useRef(false);
	const data = (
		result as {
			data?: {
				id: string;
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
				<div className="mt-3">
					<DropZone ideaId={data.id} userId={userId} />
				</div>
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

// ── Inline option extraction ──────────────────────────────────────────────

/**
 * Detects inline option lists in AI text like:
 * "Are you thinking about simplifying the form, reducing steps, or something else?"
 * Returns the extracted options, or null if no pattern found.
 */
function extractInlineOptions(text: string): string[] | null {
	// Skip example lists and parenthetical asides
	if (/\betc\b\.?/i.test(text) || /\be\.g\b\.?/i.test(text)) return null;
	if (/\bfor (?:example|instance)\b/i.test(text)) return null;

	// Only match the LAST sentence that contains "X, Y, or Z?"
	// Split on sentence boundaries but keep the delimiters
	const sentences = text.split(/(?<=[.!])\s+/);
	const candidate = sentences.filter((s) => s.includes(", or ") && s.trim().endsWith("?")).pop();
	if (!candidate) return null;

	// Match the comma-or list pattern within the sentence
	const match = candidate.match(/([^:]*(?:,\s+[^,?]+)+,\s+or\s+[^?]+)\?$/);
	if (!match) return null;

	const listText = match[1].trim();
	const parts = listText.split(/,\s+/);

	const lastPart = parts.pop();
	if (!lastPart || !/^or\s+/i.test(lastPart)) return null;
	if (parts.length < 1) return null;

	const options = [...parts, lastPart.replace(/^or\s+/i, "")];

	// Strip question prefix from the first item (up to common prepositions)
	options[0] = options[0].replace(/^.*?\b(?:about|for|like|between|of|to|into|whether)\s+/i, "");

	// Filter: must be short (tappable label) and not contain question marks
	const clean = options
		.map((o) => o.trim())
		.filter((o) => o.length > 0 && o.length < 60 && !o.includes("?"));

	return clean.length >= 2 ? clean : null;
}

const READINESS_STEPS = ["Capture", "Clarify", "Review", "Ready"] as const;

const ReadinessToolUI: ToolCallMessagePartComponent = ({ args }) => {
	const { level, summary } = args as { level: number; summary: string };

	return (
		<div className="mt-2 flex items-center gap-2.5">
			<div className="flex items-center gap-1">
				{READINESS_STEPS.map((step, i) => (
					<Fragment key={step}>
						{i > 0 && (
							<div
								className={cn(
									"h-0.5 w-3 rounded-full transition-colors",
									i < level ? (level >= 4 ? "bg-green-500" : "bg-primary") : "bg-muted",
								)}
							/>
						)}
						<div
							className={cn(
								"size-2 rounded-full transition-all",
								i < level ? (level >= 4 ? "bg-green-500" : "bg-primary") : "bg-muted",
								i === level - 1 && level < 4 && "ring-2 ring-primary/20",
								i === level - 1 && level >= 4 && "ring-2 ring-green-500/20",
							)}
						/>
					</Fragment>
				))}
			</div>
			<span className="text-[11px] text-muted-foreground">{summary}</span>
		</div>
	);
};

// ── Chat thread ────────────────────────────────────────────────────────────

function ChatThread({
	suggestedPrompts,
	onFirstMessage,
	onReset,
	compact,
	initialPrompt,
}: {
	suggestedPrompts: string[];
	onFirstMessage?: () => void;
	onReset?: () => void;
	compact?: boolean;
	initialPrompt?: string | null;
}) {
	const thread = useThread();
	const threadRuntime = useThreadRuntime();
	const hasMessages = thread.messages.length > 0;
	const firedRef = useRef(false);
	const promptSentRef = useRef(false);
	const [inputEmpty, setInputEmpty] = useState(true);

	// Check if the submit_idea tool has already been called
	const hasSubmitted = thread.messages.some((m) =>
		m.content.some((part) => part.type === "tool-call" && part.toolName === "submit_idea"),
	);

	// AI-driven readiness: scan messages for the latest set_readiness tool call
	const readinessLevel = useMemo(() => {
		for (let i = thread.messages.length - 1; i >= 0; i--) {
			const msg = thread.messages[i];
			for (const part of msg.content) {
				if (part.type === "tool-call" && part.toolName === "set_readiness") {
					return (part.args as { level: number }).level;
				}
			}
		}
		return 0;
	}, [thread.messages]);

	// Primary gate: AI reports readiness >= 4
	// Fallback: 4+ user messages if AI never called set_readiness
	const userMessageCount = thread.messages.filter((m) => m.role === "user").length;
	const readyToSubmit =
		!hasSubmitted && (readinessLevel >= 4 || (readinessLevel === 0 && userMessageCount >= 4));

	// Submit pill: visible when ready and AI is done responding
	const showSubmitPill = readyToSubmit && !thread.isRunning && !compact;

	// Confirm-style send button: green checkmark when ready + input empty
	const showConfirmButton = readyToSubmit && inputEmpty;

	// Reset inputEmpty when messages change (after send, input clears)
	const messageCount = thread.messages.length;
	useEffect(() => {
		if (messageCount > 0) setInputEmpty(true);
	}, [messageCount]);

	const sendConfirm = () => {
		threadRuntime.append({
			role: "user",
			content: [{ type: "text", text: "Yes" }],
		});
	};

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

				{/* Quick-action pills */}
				{!compact && (
					<AnimatePresence>
						{hasMessages && !thread.isRunning && !hasSubmitted && (
							<motion.div
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 6 }}
								transition={{ duration: 0.25, ease: "easeOut" }}
								className="flex items-center justify-center gap-2 px-4 pb-2"
							>
								<AnimatePresence>
									{showSubmitPill && (
										<motion.div
											initial={{ opacity: 0, scale: 0.9 }}
											animate={{ opacity: 1, scale: 1 }}
											transition={{ duration: 0.2, ease: "easeOut" }}
										>
											<Button
												size="sm"
												className="gap-1.5 bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
												onClick={sendConfirm}
											>
												<Check className="size-3.5" />
												Submit to ThoughtBox
												<kbd className="ml-1 rounded bg-green-700/50 px-1 py-0.5 font-mono text-[10px] leading-none dark:bg-green-500/30">
													↵
												</kbd>
											</Button>
										</motion.div>
									)}
								</AnimatePresence>
								{onReset && (
									<Button
										variant="ghost"
										size="sm"
										className="gap-1.5 text-muted-foreground"
										onClick={onReset}
									>
										<RotateCcw className="size-3" />
										Start over
									</Button>
								)}
							</motion.div>
						)}
					</AnimatePresence>
				)}

				<div className={compact ? "p-3" : "border-t p-4"}>
					<ComposerPrimitive.Root className="flex items-end gap-2">
						<ComposerPrimitive.Input
							placeholder={
								readyToSubmit
									? "Add details or press Enter to confirm..."
									: compact
										? "Describe your idea here..."
										: "Tell me about your idea..."
							}
							className={`flex-1 resize-none rounded-lg border border-transparent bg-muted/50 px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-border/50 ${compact ? "h-[72px] min-h-[72px] max-h-[72px]" : ""}`}
							autoFocus
							onChange={(e) => setInputEmpty(!(e.target as HTMLTextAreaElement).value.trim())}
							onKeyDown={(e) => {
								if (
									e.key === "Enter" &&
									!e.shiftKey &&
									readyToSubmit &&
									!(e.target as HTMLTextAreaElement).value.trim()
								) {
									e.preventDefault();
									sendConfirm();
								}
							}}
						/>
						{showConfirmButton ? (
							<Button
								size="icon"
								className="shrink-0 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
								aria-label="Confirm and submit"
								onClick={sendConfirm}
							>
								<Check className="size-4" />
							</Button>
						) : (
							<ComposerPrimitive.Send asChild>
								<Button size="icon" className="shrink-0" aria-label="Send message">
									<ArrowUp className="size-4" />
								</Button>
							</ComposerPrimitive.Send>
						)}
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

function TypingIndicator() {
	return (
		<div className="flex items-center gap-1 py-1">
			<span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
			<span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
			<span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
		</div>
	);
}

function AssistantMessage() {
	const thread = useThread();
	const threadRuntime = useThreadRuntime();

	const sendOption = (text: string) => {
		threadRuntime.append({
			role: "user",
			content: [{ type: "text", text }],
		});
	};

	return (
		<div className="flex justify-start">
			<div className="max-w-[85%] space-y-2 rounded-2xl bg-muted px-4 py-2.5 text-sm">
				<MessagePrimitive.Content
					components={{
						Text: ({ text }) => {
							if (!text) return <TypingIndicator />;
							const inlineOptions = !thread.isRunning ? extractInlineOptions(text) : null;
							return (
								<div>
									<div className="whitespace-pre-wrap">{parseMarkdown(text)}</div>
									{inlineOptions && (
										<div className="mt-2 flex flex-col gap-1.5">
											{inlineOptions.map((option) => (
												<button
													key={option}
													type="button"
													onClick={() => sendOption(option)}
													className="w-full rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-left text-sm font-medium transition-all hover:border-primary/40 hover:bg-primary/10 active:scale-[0.98]"
												>
													{option}
												</button>
											))}
										</div>
									)}
								</div>
							);
						},
						tools: {
							by_name: {
								set_readiness: ReadinessToolUI,
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
	onReset?: () => void;
	onError?: () => void;
	compact?: boolean;
	initialPrompt?: string | null;
}

export function ChatInterface({
	user,
	suggestedPrompts,
	onFirstMessage,
	onReset,
	onError,
	compact,
	initialPrompt,
}: ChatInterfaceProps) {
	const onErrorRef = useRef(onError);
	onErrorRef.current = onError;

	const transport = useMemo(
		() =>
			new AssistantChatTransport({
				api: "/api/chat",
				body: { userId: user.id },
				fetch: async (input, init) => {
					const res = await fetch(input, init);
					if (res.status >= 500) {
						onErrorRef.current?.();
					}
					return res;
				},
			}),
		[user.id],
	);

	const runtime = useChatRuntime({ transport });

	return (
		<ChatUserContext.Provider value={user.id}>
			<AssistantRuntimeProvider runtime={runtime}>
				<ChatThread
					suggestedPrompts={suggestedPrompts}
					onFirstMessage={onFirstMessage}
					onReset={onReset}
					compact={compact}
					initialPrompt={initialPrompt}
				/>
			</AssistantRuntimeProvider>
		</ChatUserContext.Provider>
	);
}
