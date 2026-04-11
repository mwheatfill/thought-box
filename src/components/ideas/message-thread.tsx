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
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import { UserCardPopover } from "#/components/ui/user-card";
import { cn } from "#/lib/utils";

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
	content: string | null;
	createdAt: string;
	attachments?: MessageFile[];
}

interface MessageThreadProps {
	messages: Message[];
	currentUserId: string;
	ideaId?: string;
	onSend: (content: string) => Promise<{ messageId?: string } | undefined>;
	onAttachmentUpload?: () => void;
	isSending: boolean;
}

export function MessageThread({
	messages,
	currentUserId,
	ideaId,
	onSend,
	onAttachmentUpload,
	isSending,
}: MessageThreadProps) {
	const [draft, setDraft] = useState("");
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const [isSendingWithFiles, setIsSendingWithFiles] = useState(false);
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

	const handleSend = async () => {
		const text = draft.trim();
		if (!text && pendingFiles.length === 0) return;

		setIsSendingWithFiles(true);
		try {
			let messageId: string | undefined;

			// Send message text if present
			if (text) {
				setDraft("");
				const result = await onSend(text);
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

			{/* Messages */}
			{messages.length === 0 ? (
				<p className="py-4 text-center text-sm text-muted-foreground">
					No messages yet. Start a conversation about this idea.
				</p>
			) : (
				<div className="space-y-3">
					{messages.map((msg) => {
						const isOwn = msg.actorId === currentUserId;
						return (
							<div
								key={msg.id}
								className={cn("flex flex-col", isOwn ? "items-end" : "items-start")}
							>
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
									{msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
									{msg.attachments && msg.attachments.length > 0 && (
										<div className={cn("space-y-1", msg.content && "mt-1.5")}>
											{msg.attachments.map((att) => (
												<a
													key={att.id}
													href={`/api/attachments/${att.id}`}
													target="_blank"
													rel="noopener noreferrer"
													className={cn(
														"flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
														isOwn
															? "bg-primary-foreground/10 hover:bg-primary-foreground/20"
															: "bg-background/50 hover:bg-background/80",
													)}
												>
													<FileTypeIcon
														contentType={att.contentType}
														className={cn(
															"size-3.5",
															isOwn ? "text-primary-foreground/70" : "text-muted-foreground",
														)}
													/>
													<span className="max-w-[150px] truncate">{att.filename}</span>
													<span
														className={
															isOwn ? "text-primary-foreground/50" : "text-muted-foreground"
														}
													>
														{formatFileSize(att.sizeBytes)}
													</span>
												</a>
											))}
										</div>
									)}
								</div>
								<p className="mt-0.5 text-xs text-muted-foreground">
									{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
								</p>
							</div>
						);
					})}
				</div>
			)}

			{/* Compose area */}
			<div className="space-y-2">
				{/* Pending files */}
				{pendingFiles.length > 0 && (
					<div className="flex flex-wrap gap-2">
						{pendingFiles.map((file, i) => (
							<div
								key={`${file.name}-${i}`}
								className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs"
							>
								<FileTypeIcon contentType={file.type} className="size-3.5 text-muted-foreground" />
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

				{/* Input row */}
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
					<Textarea
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						placeholder="Type a message..."
						className="min-h-[60px] resize-none"
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								handleSend();
							}
						}}
					/>
					<Button
						size="icon"
						onClick={handleSend}
						disabled={(!draft.trim() && pendingFiles.length === 0) || sending}
						className="shrink-0 self-end"
					>
						{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
					</Button>
				</div>
			</div>
		</div>
	);
}
