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
	X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
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
}

export function DropZone({
	ideaId,
	userId,
	messageId,
	onUpload,
	onDelete,
	existingFiles = [],
	disabled,
	compact,
}: DropZoneProps) {
	const [isDragging, setIsDragging] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const dragCounter = useRef(0);

	const validateFile = (file: File): string | null => {
		if (!ALLOWED_TYPES.has(file.type)) {
			return `"${file.name}" is not an allowed file type.`;
		}
		if (file.size > MAX_SIZE) {
			return `"${file.name}" exceeds the 10MB limit.`;
		}
		return null;
	};

	const uploadFile = useCallback(
		async (file: File) => {
			const error = validateFile(file);
			if (error) {
				toast.error(error);
				return;
			}

			setUploading(true);
			setUploadProgress(file.name);

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
					const data = await res.json();
					throw new Error(data.error || "Upload failed");
				}

				const uploaded = await res.json();
				onUpload?.(uploaded);
				toast.success(`${file.name} uploaded`);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "Upload failed");
			} finally {
				setUploading(false);
				setUploadProgress(null);
			}
		},
		[ideaId, userId, messageId, onUpload],
	);

	const handleFiles = useCallback(
		(files: FileList | File[]) => {
			for (const file of Array.from(files)) {
				uploadFile(file);
			}
		},
		[uploadFile],
	);

	const handleDragEnter = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounter.current++;
		if (dragCounter.current === 1) {
			setIsDragging(true);
		}
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounter.current--;
		if (dragCounter.current === 0) {
			setIsDragging(false);
		}
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
			if (disabled || uploading) return;
			if (e.dataTransfer.files.length > 0) {
				handleFiles(e.dataTransfer.files);
			}
		},
		[disabled, uploading, handleFiles],
	);

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
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
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
			{existingFiles.length > 0 && (
				<div className="mt-3 space-y-1.5">
					{existingFiles.map((f) => (
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
									onClick={async () => {
										const res = await fetch(`/api/attachments/${f.id}`, {
											method: "DELETE",
											headers: { "Content-Type": "application/json" },
											body: JSON.stringify({ userId }),
										});
										if (res.ok) {
											toast.success(`${f.filename} deleted`);
											onDelete?.();
										} else {
											toast.error("Failed to delete file");
										}
									}}
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
