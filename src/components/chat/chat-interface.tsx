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
import { ArrowUp, Check, ExternalLink, Loader2, Pencil, RotateCcw, Send } from "lucide-react";
import { Fragment, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { IdeaSubmittedCard } from "#/components/chat/idea-submitted-card";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { DropZone } from "#/components/ui/drop-zone";
import { cn, fireSubmissionConfetti } from "#/lib/utils";
import type { AuthUser } from "#/server/middleware/auth";

const ChatUserContext = createContext<string>("");

const READINESS_STEPS = ["Capture", "Clarify", "Review", "Submit"] as const;

const TOOL_NAMES = {
	SET_READINESS: "set_readiness",
	PRESENT_CONFIRMATION: "present_confirmation",
	SUBMIT_IDEA: "submit_idea",
	REDIRECT: "redirect_to_form",
} as const;

function sendUserMessage(threadRuntime: ReturnType<typeof useThreadRuntime>, text: string) {
	threadRuntime.append({ role: "user", content: [{ type: "text", text }] });
}

// ── Tool UI components ─────────────────────────────────────────────────────

const SubmitIdeaToolUI: ToolCallMessagePartComponent = ({ result }) => {
	const data = (result as { data?: Record<string, unknown> })?.data;

	if (!data) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="size-4 animate-spin" />
				Submitting your idea...
			</div>
		);
	}

	return null;
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

const ReadinessToolUI: ToolCallMessagePartComponent = ({ args }) => {
	const { options } = args as { options?: string[] };
	const thread = useThread();
	const threadRuntime = useThreadRuntime();

	if (!options || options.length < 2 || thread.isRunning) return null;

	return (
		<div className="mt-3 flex flex-col gap-1.5">
			{options.map((option) => (
				<Button
					key={option}
					variant="outline"
					size="lg"
					className="h-auto w-full justify-start whitespace-normal rounded-xl border-primary/20 bg-primary/5 px-4 py-3 text-left font-medium hover:border-primary/40 hover:bg-primary/10 active:scale-[0.98]"
					onClick={() => sendUserMessage(threadRuntime, option)}
				>
					{option}
				</Button>
			))}
		</div>
	);
};

const ConfirmationToolUI: ToolCallMessagePartComponent = ({ args }) => {
	const { confirmLabel, editLabel } = args as {
		confirmLabel: string;
		editLabel: string;
	};
	const thread = useThread();
	const threadRuntime = useThreadRuntime();

	if (thread.isRunning) return null;

	return (
		<div className="mt-3 flex flex-col gap-2">
			<Button
				size="lg"
				className="h-auto w-full justify-start gap-2 whitespace-normal rounded-xl bg-green-600 px-4 py-3 text-left font-medium text-white hover:bg-green-700 active:scale-[0.98] dark:bg-green-600 dark:hover:bg-green-700"
				onClick={() => sendUserMessage(threadRuntime, confirmLabel)}
			>
				<Send className="size-4 shrink-0" />
				{confirmLabel}
			</Button>
			<Button
				variant="outline"
				size="lg"
				className="h-auto w-full justify-start gap-2 whitespace-normal rounded-xl px-4 py-3 text-left font-medium active:scale-[0.98]"
				onClick={() => sendUserMessage(threadRuntime, editLabel)}
			>
				<Pencil className="size-4 shrink-0" />
				{editLabel}
			</Button>
		</div>
	);
};

// ── Chat thread ────────────────────────────────────────────────────────────

function ChatThread({
	onFirstMessage,
	onSubmitted,
	onReset,
	compact,
	initialPrompt,
}: {
	onFirstMessage?: () => void;
	onSubmitted?: () => void;
	onReset?: () => void;
	compact?: boolean;
	initialPrompt?: string | null;
}) {
	const userId = useContext(ChatUserContext);
	const thread = useThread();
	const threadRuntime = useThreadRuntime();
	const hasMessages = thread.messages.length > 0;
	const firedRef = useRef(false);
	const submittedRef = useRef(false);
	const promptSentRef = useRef(false);
	const [inputEmpty, setInputEmpty] = useState(true);

	const submittedData = useMemo(() => {
		for (const m of thread.messages) {
			for (const part of m.content) {
				if (part.type === "tool-call" && part.toolName === TOOL_NAMES.SUBMIT_IDEA && part.result) {
					const res = part.result as {
						data?: {
							id: string;
							submissionId: string;
							title: string;
							categoryName: string;
						};
					};
					if (res.data) return res.data;
				}
			}
		}
		return null;
	}, [thread.messages]);
	const hasSubmitted = submittedData !== null;

	const readinessLevel = useMemo(() => {
		for (let i = thread.messages.length - 1; i >= 0; i--) {
			const msg = thread.messages[i];
			for (const part of msg.content) {
				if (part.type === "tool-call" && part.toolName === TOOL_NAMES.PRESENT_CONFIRMATION) {
					return 4;
				}
				if (part.type === "tool-call" && part.toolName === TOOL_NAMES.SET_READINESS) {
					return (part.args as { level: number }).level;
				}
			}
		}
		return 0;
	}, [thread.messages]);

	// Fallback: if the AI never calls set_readiness/present_confirmation after 4+ messages,
	// show confirm UI on the composer. Normal flow uses ConfirmationToolUI instead.
	const userMessageCount = thread.messages.filter((m) => m.role === "user").length;
	const readyToSubmit = !hasSubmitted && readinessLevel === 0 && userMessageCount >= 4;
	const showConfirmButton = readyToSubmit && inputEmpty;

	const sendConfirm = () => {
		sendUserMessage(threadRuntime, "Yes");
		setInputEmpty(true);
	};

	// Send initial prompt from landing page card click
	useEffect(() => {
		if (initialPrompt && !promptSentRef.current) {
			promptSentRef.current = true;
			sendUserMessage(threadRuntime, initialPrompt);
		}
	}, [initialPrompt, threadRuntime]);

	useEffect(() => {
		if (hasMessages && !firedRef.current && onFirstMessage) {
			firedRef.current = true;
			onFirstMessage();
		}
	}, [hasMessages, onFirstMessage]);

	useEffect(() => {
		if (hasSubmitted && !submittedRef.current) {
			submittedRef.current = true;
			fireSubmissionConfetti();
			onSubmitted?.();
		}
	}, [hasSubmitted, onSubmitted]);

	// Post-submission: celebration card takes over the entire chat window
	if (hasSubmitted && submittedData) {
		return (
			<div className="flex h-full flex-col items-center justify-center overflow-y-auto">
				<IdeaSubmittedCard
					submissionId={submittedData.submissionId}
					title={submittedData.title}
					categoryName={submittedData.categoryName}
					onNewIdea={onReset}
				>
					<DropZone ideaId={submittedData.id} userId={userId} />
				</IdeaSubmittedCard>
			</div>
		);
	}

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

				{/* Status bar: progress stepper + start over */}
				{!compact && hasMessages && !hasSubmitted && (
					<div className="flex items-center gap-3 px-4 pb-2">
						{/* Progress stepper */}
						{readinessLevel > 0 && (
							<div className="flex items-center gap-1">
								{READINESS_STEPS.map((step, i) => {
									const isDone = readinessLevel > i + 1;
									const isActive = readinessLevel === i + 1;
									return (
										<Fragment key={step}>
											{i > 0 && (
												<div
													className={cn(
														"h-0.5 w-5 rounded-full transition-colors",
														isDone ? "bg-primary" : "bg-muted",
													)}
												/>
											)}
											<div className="flex items-center gap-1">
												{isDone ? (
													<div className="flex size-4 items-center justify-center rounded-full bg-primary">
														<Check className="size-2.5 text-primary-foreground" />
													</div>
												) : (
													<div
														className={cn(
															"size-4 rounded-full border-2 transition-colors",
															isActive
																? "border-primary bg-primary/20"
																: "border-muted-foreground/30",
														)}
													/>
												)}
												<span
													className={cn(
														"text-xs transition-colors",
														isDone || isActive
															? "font-medium text-foreground"
															: "text-muted-foreground",
													)}
												>
													{step}
												</span>
											</div>
										</Fragment>
									);
								})}
							</div>
						)}

						<div className="flex-1" />

						{/* Start over */}
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
					</div>
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
	return (
		<div className="flex items-start gap-2.5">
			<Avatar className="size-9 shrink-0">
				<AvatarImage src="/agent-avatar.jpeg" alt="ThoughtBox assistant" />
				<AvatarFallback>TB</AvatarFallback>
			</Avatar>
			<div className="max-w-[85%] space-y-2 rounded-2xl bg-muted px-4 py-2.5 text-sm">
				<MessagePrimitive.Content
					components={{
						Text: ({ text }) => {
							if (!text) return <TypingIndicator />;
							return <div className="whitespace-pre-wrap">{parseMarkdown(text)}</div>;
						},
						tools: {
							by_name: {
								[TOOL_NAMES.SET_READINESS]: ReadinessToolUI,
								[TOOL_NAMES.PRESENT_CONFIRMATION]: ConfirmationToolUI,
								[TOOL_NAMES.SUBMIT_IDEA]: SubmitIdeaToolUI,
								[TOOL_NAMES.REDIRECT]: RedirectToolUI,
							},
						},
					}}
				/>
			</div>
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
	onFirstMessage?: () => void;
	onSubmitted?: () => void;
	onReset?: () => void;
	onError?: () => void;
	compact?: boolean;
	initialPrompt?: string | null;
}

export function ChatInterface({
	user,
	onFirstMessage,
	onSubmitted,
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
					onFirstMessage={onFirstMessage}
					onSubmitted={onSubmitted}
					onReset={onReset}
					compact={compact}
					initialPrompt={initialPrompt}
				/>
			</AssistantRuntimeProvider>
		</ChatUserContext.Provider>
	);
}
