import { formatDistanceToNow } from "date-fns";
import {
	File,
	FileImage,
	FileSpreadsheet,
	FileText,
	FileUp,
	Loader2,
	Paperclip,
	Presentation,
	Send,
	X,
} from "lucide-react";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import {
	type MentionLookup,
	MentionTextarea,
	type Mentionable,
	buildMentionLookup,
	parseMentions,
} from "#/components/ui/mention-textarea";
import { Textarea } from "#/components/ui/textarea";
import { UserCardPopover } from "#/components/ui/user-card";
import { cn, escapeRegex, initials, isSendShortcut } from "#/lib/utils";

const ALLOWED_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
	"image/svg+xml",
	"application/pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"text/csv",
	"text/plain",
]);

const MAX_SIZE = 10 * 1024 * 1024;

function validateFile(file: File): string | null {
	if (!ALLOWED_TYPES.has(file.type)) return `"${file.name}" is not an allowed file type.`;
	if (file.size > MAX_SIZE) return `"${file.name}" exceeds the 10MB limit.`;
	return null;
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeIcon({ contentType, className }: { contentType: string; className?: string }) {
	const cls = className ?? "size-4 shrink-0 text-muted-foreground";
	if (contentType.startsWith("image/")) return <FileImage className={cls} />;
	if (contentType === "application/pdf") return <FileText className={cls} />;
	if (contentType.includes("spreadsheet") || contentType === "text/csv")
		return <FileSpreadsheet className={cls} />;
	if (contentType.includes("presentation")) return <Presentation className={cls} />;
	if (contentType.includes("word")) return <FileText className={cls} />;
	return <File className={cls} />;
}

interface MessageFile {
	id: string;
	filename: string;
	contentType: string;
	sizeBytes: number;
}

interface Message {
	id: string;
	actorId: string;
	actorName: string;
	actorPhotoUrl?: string | null;
	content: string | null;
	createdAt: string;
	attachments?: MessageFile[];
	mentions?: string[];
}

interface MessageThreadProps {
	messages: Message[];
	currentUserId: string;
	ideaId?: string;
	onSend: (content: string, mentions?: string[]) => Promise<{ messageId?: string } | undefined>;
	onAttachmentUpload?: () => void;
	isSending: boolean;
	/**
	 * When provided, the composer accepts `@mentions` and the picker shows
	 * this directory. Messages in the thread also get their @tokens styled.
	 * Omit for the submitter-facing thread (no mentions).
	 */
	mentionable?: Mentionable[];
	placeholder?: string;
	/**
	 * Rendered when the thread has no messages. Defaults to a single line
	 * of muted text; pass a full `<Empty />` block for richer states.
	 */
	emptyMessage?: ReactNode;
	/**
	 * `chat` renders left/right bubbles (submitter ↔ owner conversation).
	 * `notes` renders a vertical timeline (avatar + name + timestamp +
	 * content block), better suited to owner-internal notes than the
	 * sender-aligned bubble pattern.
	 */
	variant?: "chat" | "notes";
	/**
	 * Persistent audience indicator rendered above the composer — caller
	 * decides whether this thread is "visible to the submitter" or
	 * "owner/admin only", and renders the appropriate JSX. Keeping it out
	 * of MessageThread lets each tab speak in its own voice.
	 */
	audience?: ReactNode;
	/**
	 * Text label for the send button. When set, the button shows the icon
	 * plus this label (e.g., "Send to Sarah" / "Save note"). When omitted,
	 * the button stays icon-only.
	 */
	sendLabel?: string;
	/**
	 * Icon for the send/save button. Defaults to the paper-plane Send icon
	 * (appropriate for messaging). Override with e.g. NotebookPen when the
	 * action is "save" rather than "send".
	 */
	sendIcon?: ReactNode;
}

interface AudienceBannerProps {
	icon: ReactNode;
	label: ReactNode;
	tone: "visible" | "private";
	avatar?: { displayName: string; photoUrl?: string | null };
}

/**
 * Small pill above the composer that names who can read the thread.
 * `visible` (amber tint) = external audience; `private` (muted) = team-only.
 */
export function AudienceBanner({ icon, label, tone, avatar }: AudienceBannerProps) {
	return (
		<div
			className={cn(
				"inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-xs",
				tone === "visible"
					? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
					: "bg-muted/70 text-muted-foreground",
			)}
		>
			{icon}
			{avatar && (
				<Avatar className="size-4">
					{avatar.photoUrl && <AvatarImage src={avatar.photoUrl} alt={avatar.displayName} />}
					<AvatarFallback className="text-[8px]">{initials(avatar.displayName)}</AvatarFallback>
				</Avatar>
			)}
			<span>{label}</span>
		</div>
	);
}

interface ItemProps {
	msg: Message;
	mentionLookup: MentionLookup | null;
}

type AttachmentTone = "note" | "bubble-own" | "bubble-other";

function AttachmentLink({ att, tone }: { att: MessageFile; tone: AttachmentTone }) {
	const linkClass =
		tone === "note"
			? "bg-muted/60 hover:bg-muted"
			: tone === "bubble-own"
				? "bg-primary-foreground/10 hover:bg-primary-foreground/20"
				: "bg-background/50 hover:bg-background/80";
	const iconClass =
		tone === "note"
			? undefined
			: tone === "bubble-own"
				? "text-primary-foreground/70"
				: "text-muted-foreground";
	const sizeClass =
		tone === "note"
			? "text-muted-foreground"
			: tone === "bubble-own"
				? "text-primary-foreground/50"
				: "text-muted-foreground";
	const maxWidth = tone === "note" ? "max-w-[180px]" : "max-w-[150px]";
	return (
		<a
			href={`/api/attachments/${att.id}`}
			target="_blank"
			rel="noopener noreferrer"
			className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-xs", linkClass)}
		>
			<FileTypeIcon contentType={att.contentType} className={cn("size-3.5", iconClass)} />
			<span className={cn("truncate", maxWidth)}>{att.filename}</span>
			<span className={sizeClass}>{formatFileSize(att.sizeBytes)}</span>
		</a>
	);
}

function NoteItem({ msg, mentionLookup, isLast }: ItemProps & { isLast: boolean }) {
	return (
		<div className="flex gap-3">
			<div className="flex flex-col items-center">
				<Avatar className="size-7 shrink-0">
					{msg.actorPhotoUrl && <AvatarImage src={msg.actorPhotoUrl} alt={msg.actorName} />}
					<AvatarFallback className="text-[10px]">{initials(msg.actorName)}</AvatarFallback>
				</Avatar>
				{!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
			</div>
			<div className={cn("min-w-0 flex-1 pb-4", isLast && "pb-0")}>
				<div className="flex items-baseline justify-between gap-2">
					<UserCardPopover userId={msg.actorId}>
						<button
							type="button"
							className="text-sm font-medium hover:text-primary hover:underline"
						>
							{msg.actorName}
						</button>
					</UserCardPopover>
					<span className="text-xs text-muted-foreground">
						{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
					</span>
				</div>
				{msg.content && (
					<p className="mt-1 whitespace-pre-wrap text-sm">
						{renderContent(msg.content, mentionLookup)}
					</p>
				)}
				{msg.attachments && msg.attachments.length > 0 && (
					<div className={cn("space-y-1", msg.content && "mt-2")}>
						{msg.attachments.map((att) => (
							<AttachmentLink key={att.id} att={att} tone="note" />
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function ChatBubble({ msg, mentionLookup, currentUserId }: ItemProps & { currentUserId: string }) {
	const isOwn = msg.actorId === currentUserId;
	return (
		<div className={cn("flex flex-col", isOwn ? "items-end" : "items-start")}>
			<div
				className={cn(
					"max-w-[85%] rounded-xl px-3 py-2 text-sm",
					isOwn ? "bg-primary text-primary-foreground" : "bg-muted",
				)}
			>
				{!isOwn && msg.actorId && (
					<UserCardPopover userId={msg.actorId}>
						<button
							type="button"
							className="mb-0.5 text-xs font-medium hover:text-primary hover:underline"
						>
							{msg.actorName}
						</button>
					</UserCardPopover>
				)}
				{msg.content && (
					<p className="whitespace-pre-wrap">{renderContent(msg.content, mentionLookup)}</p>
				)}
				{msg.attachments && msg.attachments.length > 0 && (
					<div className={cn("space-y-1", msg.content && "mt-1.5")}>
						{msg.attachments.map((att) => (
							<AttachmentLink key={att.id} att={att} tone={isOwn ? "bubble-own" : "bubble-other"} />
						))}
					</div>
				)}
			</div>
			<p className="mt-0.5 text-xs text-muted-foreground">
				{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
			</p>
		</div>
	);
}

function renderContent(text: string, lookup: MentionLookup | null) {
	if (!lookup) return text;
	const nodes: React.ReactNode[] = [];
	let lastIndex = 0;
	let i = 0;
	for (const match of text.matchAll(lookup.pattern)) {
		if (match.index === undefined) continue;
		if (match.index > lastIndex) {
			// biome-ignore lint/suspicious/noArrayIndexKey: text fragments are positional
			nodes.push(<span key={i++}>{text.slice(lastIndex, match.index)}</span>);
		}
		const name = match[1];
		// idByName + pattern share the same directory, so a regex match always
		// resolves to an ID — no fallback path needed.
		const userId = lookup.idByName.get(name);
		if (userId) {
			nodes.push(
				// biome-ignore lint/suspicious/noArrayIndexKey: text fragments are positional
				<UserCardPopover key={i++} userId={userId}>
					<button
						type="button"
						className="rounded-sm bg-primary/15 px-1 font-medium text-primary hover:bg-primary/25"
					>
						@{name}
					</button>
				</UserCardPopover>,
			);
		}
		lastIndex = match.index + match[0].length;
	}
	if (lastIndex < text.length) {
		// biome-ignore lint/suspicious/noArrayIndexKey: text fragments are positional
		nodes.push(<span key={i++}>{text.slice(lastIndex)}</span>);
	}
	return nodes;
}

export function MessageThread({
	messages,
	currentUserId,
	ideaId,
	onSend,
	onAttachmentUpload,
	isSending,
	mentionable,
	placeholder = "Type a message...",
	emptyMessage = (
		<p className="py-4 text-center text-sm text-muted-foreground">
			No messages yet. Start a conversation about this idea.
		</p>
	),
	variant = "chat",
	audience,
	sendLabel,
	sendIcon = <Send className="size-4" />,
}: MessageThreadProps) {
	const [draft, setDraft] = useState("");
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const [isSendingWithFiles, setIsSendingWithFiles] = useState(false);
	const mentionLookup = useMemo(
		() => (mentionable ? buildMentionLookup(mentionable) : null),
		[mentionable],
	);
	const dragCounter = useRef(0);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const addFiles = useCallback((files: FileList | File[]) => {
		const valid: File[] = [];
		for (const file of Array.from(files)) {
			const error = validateFile(file);
			if (error) {
				toast.error(error);
			} else {
				valid.push(file);
			}
		}
		if (valid.length > 0) {
			setPendingFiles((prev) => [...prev, ...valid]);
		}
	}, []);

	const removePendingFile = (index: number) => {
		setPendingFiles((prev) => prev.filter((_, i) => i !== index));
	};

	// Resolved mentions are shown as removable chips because the textarea
	// itself can't host clickable inline nodes.
	const resolvedMentions = useMemo(() => {
		if (!mentionable || !mentionLookup || draft.length === 0) return [];
		const ids = parseMentions(draft, mentionLookup);
		return ids
			.map((id) => mentionable.find((u) => u.id === id))
			.filter((u): u is Mentionable => u !== undefined);
	}, [draft, mentionable, mentionLookup]);

	const removeMention = (displayName: string) => {
		const pattern = new RegExp(`@${escapeRegex(displayName)}\\s?`, "gu");
		setDraft((prev) => prev.replace(pattern, ""));
	};

	const handleSend = async () => {
		const text = draft.trim();
		if (!text && pendingFiles.length === 0) return;

		setIsSendingWithFiles(true);
		try {
			let messageId: string | undefined;

			// Send message text if present
			if (text) {
				const mentions = mentionLookup ? parseMentions(text, mentionLookup) : undefined;
				setDraft("");
				const result = await onSend(text, mentions);
				messageId = result?.messageId;
			}

			// Upload pending files linked to the message
			if (pendingFiles.length > 0 && ideaId) {
				for (const file of pendingFiles) {
					const formData = new FormData();
					formData.append("file", file);
					formData.append("ideaId", ideaId);
					formData.append("userId", currentUserId);
					if (messageId) formData.append("messageId", messageId);

					const res = await fetch("/api/attachments", {
						method: "POST",
						body: formData,
					});

					if (!res.ok) {
						const data = await res.json();
						toast.error(data.error || `Failed to upload ${file.name}`);
					}
				}
				setPendingFiles([]);
				onAttachmentUpload?.();
			}
		} finally {
			setIsSendingWithFiles(false);
		}
	};

	// Drag handlers for full-viewport overlay
	const handleDragEnter = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounter.current++;
		if (dragCounter.current === 1) setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounter.current--;
		if (dragCounter.current === 0) setIsDragging(false);
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			dragCounter.current = 0;
			setIsDragging(false);
			if (e.dataTransfer.files.length > 0) {
				addFiles(e.dataTransfer.files);
			}
		},
		[addFiles],
	);

	const handlePaste = useCallback(
		(e: React.ClipboardEvent) => {
			const items = e.clipboardData.items;
			const files: File[] = [];
			for (const item of Array.from(items)) {
				if (item.kind === "file") {
					const file = item.getAsFile();
					if (file) files.push(file);
				}
			}
			if (files.length > 0) {
				e.preventDefault();
				addFiles(files);
			}
		},
		[addFiles],
	);

	const sending = isSending || isSendingWithFiles;

	return (
		<div
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
			onPaste={handlePaste}
			className="relative space-y-4"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: needed for paste
			tabIndex={0}
		>
			{/* Full-viewport drag overlay */}
			{isDragging && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-6">
					<div className="flex h-full w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/5">
						<div className="rounded-full bg-primary/10 p-5">
							<FileUp className="size-10 text-primary" />
						</div>
						<p className="mt-3 text-lg font-semibold text-primary">Drop anywhere to attach</p>
						<p className="mt-1 text-sm text-muted-foreground">
							Files will be sent with your message
						</p>
					</div>
				</div>
			)}

			{messages.length === 0 ? (
				emptyMessage
			) : variant === "notes" ? (
				<div className="space-y-0">
					{messages.map((msg, i) => (
						<NoteItem
							key={msg.id}
							msg={msg}
							mentionLookup={mentionLookup}
							isLast={i === messages.length - 1}
						/>
					))}
				</div>
			) : (
				<div className="space-y-3">
					{messages.map((msg) => (
						<ChatBubble
							key={msg.id}
							msg={msg}
							mentionLookup={mentionLookup}
							currentUserId={currentUserId}
						/>
					))}
				</div>
			)}

			<div className="flex gap-2">
				<input
					ref={fileInputRef}
					type="file"
					className="hidden"
					multiple
					onChange={(e) => {
						if (e.target.files) addFiles(e.target.files);
						e.target.value = "";
					}}
				/>
				<Button
					variant="ghost"
					size="icon"
					className="shrink-0 self-end"
					onClick={() => fileInputRef.current?.click()}
					disabled={sending}
				>
					<Paperclip className="size-4" />
				</Button>
				<div className="flex min-w-0 flex-1 flex-col gap-2">
					{audience}

					{pendingFiles.length > 0 && (
						<div className="flex flex-wrap gap-2">
							{pendingFiles.map((file, i) => (
								<div
									key={`${file.name}-${i}`}
									className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs"
								>
									<FileTypeIcon
										contentType={file.type}
										className="size-3.5 text-muted-foreground"
									/>
									<span className="max-w-[120px] truncate">{file.name}</span>
									<span className="text-muted-foreground">{formatFileSize(file.size)}</span>
									<button
										type="button"
										onClick={() => removePendingFile(i)}
										className="ml-0.5 rounded p-0.5 hover:bg-foreground/10"
									>
										<X className="size-3" />
									</button>
								</div>
							))}
						</div>
					)}

					{resolvedMentions.length > 0 && (
						<div className="flex flex-wrap items-center gap-1.5">
							<span className="text-xs text-muted-foreground">Mentions:</span>
							{resolvedMentions.map((user) => (
								<span
									key={user.id}
									className="flex items-center gap-1 rounded-full border bg-primary/10 py-0.5 pl-1 pr-0.5 text-xs"
								>
									<UserCardPopover userId={user.id}>
										<button type="button" className="flex items-center gap-1.5 hover:underline">
											<Avatar className="size-4">
												{user.photoUrl && (
													<AvatarImage src={user.photoUrl} alt={user.displayName} />
												)}
												<AvatarFallback className="text-[8px]">
													{initials(user.displayName)}
												</AvatarFallback>
											</Avatar>
											<span className="font-medium text-primary">@{user.displayName}</span>
										</button>
									</UserCardPopover>
									<button
										type="button"
										onClick={() => removeMention(user.displayName)}
										className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
										title={`Remove mention of ${user.displayName}`}
									>
										<X className="size-3" />
									</button>
								</span>
							))}
						</div>
					)}

					{mentionable ? (
						<MentionTextarea
							value={draft}
							onChange={setDraft}
							onSubmit={handleSend}
							directory={mentionable}
							placeholder={placeholder}
							className="min-h-[60px] resize-none"
						/>
					) : (
						<Textarea
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							placeholder={placeholder}
							className="min-h-[60px] resize-none"
							onKeyDown={(e) => {
								if (isSendShortcut(e)) {
									e.preventDefault();
									handleSend();
								}
							}}
						/>
					)}
				</div>
				<Button
					size={sendLabel ? "default" : "icon"}
					onClick={handleSend}
					disabled={(!draft.trim() && pendingFiles.length === 0) || sending}
					className="shrink-0 self-end"
				>
					{sending ? <Loader2 className="size-4 animate-spin" /> : sendIcon}
					{sendLabel && <span className="ml-1.5">{sendLabel}</span>}
				</Button>
			</div>
		</div>
	);
}
