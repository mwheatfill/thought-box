"use client";

import {
	File,
	FileImage,
	FileSpreadsheet,
	FileText,
	FileUp,
	Loader2,
	Paperclip,
	Presentation,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
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

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ contentType }: { contentType: string }) {
	const cls = "size-4 shrink-0 text-muted-foreground";
	if (contentType.startsWith("image/")) return <FileImage className={cls} />;
	if (contentType === "application/pdf") return <FileText className={cls} />;
	if (contentType.includes("spreadsheet") || contentType === "text/csv")
		return <FileSpreadsheet className={cls} />;
	if (contentType.includes("presentation")) return <Presentation className={cls} />;
	if (contentType.includes("word")) return <FileText className={cls} />;
	return <File className={cls} />;
}

interface UploadedFile {
	id: string;
	filename: string;
	contentType: string;
	sizeBytes: number;
}

interface DropZoneProps {
	ideaId: string;
	userId: string;
	messageId?: string;
	onUpload?: (file: UploadedFile) => void;
	onDelete?: () => void;
	existingFiles?: UploadedFile[];
	disabled?: boolean;
	compact?: boolean;
	readOnly?: boolean;
}

export function DropZone({
	ideaId,
	userId,
	messageId,
	onUpload,
	onDelete,
	existingFiles,
	disabled,
	compact,
	readOnly,
}: DropZoneProps) {
	const [isDragging, setIsDragging] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState<string | null>(null);
	const [localFiles, setLocalFiles] = useState<UploadedFile[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);
	const uploadingRef = useRef(false);

	// Use existingFiles from parent if provided, otherwise track locally
	const displayFiles = existingFiles ?? localFiles;

	const validateFile = (file: File): string | null => {
		if (!ALLOWED_TYPES.has(file.type)) {
			return `"${file.name}" is not an allowed file type.`;
		}
		if (file.size > MAX_SIZE) {
			return `"${file.name}" exceeds the 10MB limit.`;
		}
		return null;
	};

	// Core upload — no toasts, no state management (caller handles that)
	const doUpload = useCallback(
		async (file: File): Promise<{ success: boolean; name: string; error?: string; data?: UploadedFile }> => {
			const validationError = validateFile(file);
			if (validationError) return { success: false, name: file.name, error: validationError };

			try {
				const formData = new FormData();
				formData.append("file", file);
				formData.append("ideaId", ideaId);
				formData.append("userId", userId);
				if (messageId) formData.append("messageId", messageId);

				const res = await fetch("/api/attachments", {
					method: "POST",
					body: formData,
				});

				if (!res.ok) {
					const body = await res.json();
					return { success: false, name: file.name, error: body.error || "Upload failed" };
				}

				const uploaded: UploadedFile = await res.json();
				onUpload?.(uploaded);
				if (!existingFiles) {
					setLocalFiles((prev) => [...prev, uploaded]);
				}
				return { success: true, name: file.name, data: uploaded };
			} catch (err) {
				return { success: false, name: file.name, error: err instanceof Error ? err.message : "Upload failed" };
			}
		},
		[ideaId, userId, messageId, onUpload, existingFiles],
	);

	const handleFiles = useCallback(
		async (files: FileList | File[]) => {
			const fileArray = Array.from(files);
			if (fileArray.length === 0) return;

			setUploading(true);
			uploadingRef.current = true;

			if (fileArray.length === 1) {
				setUploadProgress(fileArray[0].name);
				const result = await doUpload(fileArray[0]);
				if (result.success) toast.success(`${result.name} uploaded`);
				else toast.error(result.error || "Upload failed");
			} else {
				setUploadProgress(`${fileArray.length} files`);
				const results = await Promise.all(fileArray.map((f) => doUpload(f)));
				const succeeded = results.filter((r) => r.success).length;
				const failed = results.filter((r) => !r.success);
				if (succeeded > 0 && failed.length === 0) {
					toast.success(`${succeeded} files uploaded`);
				} else if (succeeded > 0) {
					toast.warning(`${succeeded} uploaded, ${failed.length} failed`);
				} else {
					toast.error(failed[0]?.error || `Failed to upload ${failed.length} files`);
				}
			}

			setUploading(false);
			uploadingRef.current = false;
			setUploadProgress(null);
		},
		[doUpload],
	);

	// Document-level drag detection — fires overlay when files dragged anywhere on page
	useEffect(() => {
		if (compact || disabled || readOnly) return;

		let counter = 0;

		const onDragEnter = (e: DragEvent) => {
			if (!e.dataTransfer?.types.includes("Files")) return;
			e.preventDefault();
			counter++;
			if (counter === 1) setIsDragging(true);
		};

		const onDragLeave = (e: DragEvent) => {
			e.preventDefault();
			counter--;
			if (counter <= 0) {
				counter = 0;
				setIsDragging(false);
			}
		};

		const onDragOver = (e: DragEvent) => {
			e.preventDefault();
		};

		const onDrop = (e: DragEvent) => {
			e.preventDefault();
			counter = 0;
			setIsDragging(false);
			if (!uploadingRef.current && e.dataTransfer?.files.length) {
				handleFiles(e.dataTransfer.files);
			}
		};

		document.addEventListener("dragenter", onDragEnter);
		document.addEventListener("dragleave", onDragLeave);
		document.addEventListener("dragover", onDragOver);
		document.addEventListener("drop", onDrop);

		return () => {
			document.removeEventListener("dragenter", onDragEnter);
			document.removeEventListener("dragleave", onDragLeave);
			document.removeEventListener("dragover", onDragOver);
			document.removeEventListener("drop", onDrop);
		};
	}, [compact, disabled, readOnly, handleFiles]);

	const handlePaste = useCallback(
		(e: React.ClipboardEvent) => {
			if (disabled || uploading) return;
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
				handleFiles(files);
			}
		},
		[disabled, uploading, handleFiles],
	);

	const handleDelete = useCallback(
		async (file: UploadedFile) => {
			const res = await fetch(`/api/attachments/${file.id}`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId }),
			});
			if (res.ok) {
				toast.success(`${file.filename} deleted`);
				if (!existingFiles) {
					setLocalFiles((prev) => prev.filter((f) => f.id !== file.id));
				}
				onDelete?.();
			} else {
				toast.error("Failed to delete file");
			}
		},
		[userId, existingFiles, onDelete],
	);

	if (readOnly) {
		return displayFiles.length > 0 ? (
			<div className="space-y-1.5">
				{displayFiles.map((f) => (
					<div key={f.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
						<a
							href={`/api/attachments/${f.id}`}
							target="_blank"
							rel="noopener noreferrer"
							className="flex min-w-0 flex-1 items-center gap-2"
						>
							<FileIcon contentType={f.contentType} />
							<span className="min-w-0 flex-1 truncate">{f.filename}</span>
							<span className="shrink-0 text-xs text-muted-foreground">
								{formatFileSize(f.sizeBytes)}
							</span>
						</a>
					</div>
				))}
			</div>
		) : (
			<p className="py-4 text-center text-sm text-muted-foreground">No attachments</p>
		);
	}

	if (compact) {
		return (
			<div onPaste={handlePaste}>
				<input
					ref={inputRef}
					type="file"
					className="hidden"
					multiple
					onChange={(e) => e.target.files && handleFiles(e.target.files)}
				/>
				<Button
					variant="ghost"
					size="sm"
					disabled={disabled || uploading}
					onClick={() => inputRef.current?.click()}
				>
					{uploading ? (
						<Loader2 className="mr-1 size-3.5 animate-spin" />
					) : (
						<Paperclip className="mr-1 size-3.5" />
					)}
					{uploading ? "Uploading..." : "Attach"}
				</Button>
			</div>
		);
	}

	return (
		<div
			onPaste={handlePaste}
			className="relative"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: needed for paste events
			tabIndex={0}
		>
			{/* Full-viewport drag overlay */}
			{isDragging && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-6">
					<div className="flex h-full w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/5">
						<div className="rounded-full bg-primary/10 p-5">
							<FileUp className="size-10 text-primary" />
						</div>
						<p className="mt-3 text-lg font-semibold text-primary">Drop anywhere to upload</p>
						<p className="mt-1 text-sm text-muted-foreground">Images, PDFs, documents up to 10MB</p>
					</div>
				</div>
			)}

			{/* Upload area */}
			<div
				className={cn(
					"rounded-lg border border-dashed p-4 text-center transition-colors",
					isDragging ? "border-primary bg-primary/5" : "border-border",
					disabled && "opacity-50",
				)}
			>
				<input
					ref={inputRef}
					type="file"
					className="hidden"
					multiple
					onChange={(e) => e.target.files && handleFiles(e.target.files)}
				/>

				{uploading ? (
					<div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Uploading {uploadProgress}...
					</div>
				) : (
					<div className="py-2">
						<FileUp className="mx-auto mb-2 size-6 text-muted-foreground" />
						<p className="text-sm text-muted-foreground">
							Drag and drop files, paste screenshots, or{" "}
							<button
								type="button"
								className="text-primary underline hover:no-underline"
								onClick={() => inputRef.current?.click()}
								disabled={disabled}
							>
								browse
							</button>
						</p>
						<p className="mt-1 text-xs text-muted-foreground/60">
							Images, PDFs, documents up to 10MB
						</p>
					</div>
				)}
			</div>

			{/* File list */}
			{displayFiles.length > 0 && (
				<div className="mt-3 space-y-1.5">
					{displayFiles.map((f) => (
						<div key={f.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
							<a
								href={`/api/attachments/${f.id}`}
								target="_blank"
								rel="noopener noreferrer"
								className="flex min-w-0 flex-1 items-center gap-2"
							>
								<FileIcon contentType={f.contentType} />
								<span className="min-w-0 flex-1 truncate">{f.filename}</span>
								<span className="shrink-0 text-xs text-muted-foreground">
									{formatFileSize(f.sizeBytes)}
								</span>
							</a>
							{!disabled && (
								<button
									type="button"
									className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground group-hover:opacity-100"
									title="Delete file"
									onClick={() => handleDelete(f)}
								>
									<Trash2 className="size-3.5" />
								</button>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
