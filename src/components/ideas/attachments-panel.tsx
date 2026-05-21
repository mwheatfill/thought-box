"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import {
	Download,
	Eye,
	EyeOff,
	File,
	FileImage,
	FileSpreadsheet,
	FileText,
	Lock,
	MoreHorizontal,
	Presentation,
	Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { DataTable, SortableHeader } from "#/components/ui/data-table";
import { DropZone } from "#/components/ui/drop-zone";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { updateAttachmentVisibility } from "#/server/functions/attachments";

export interface AttachmentRow {
	id: string;
	filename: string;
	contentType: string;
	sizeBytes: number;
	uploadedById: string;
	uploadedBy: string;
	createdAt: string;
	isInternal: boolean;
}

interface AttachmentsPanelProps {
	ideaId: string;
	currentUserId: string;
	currentUserRole: string;
	attachments: AttachmentRow[];
	readOnly?: boolean;
	onChange?: () => void;
}

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

export function AttachmentsPanel({
	ideaId,
	currentUserId,
	currentUserRole,
	attachments,
	readOnly,
	onChange,
}: AttachmentsPanelProps) {
	const queryClient = useQueryClient();
	const isOwner = currentUserRole === "owner" || currentUserRole === "admin";
	const isAdmin = currentUserRole === "admin";

	const visibilityFn = useServerFn(updateAttachmentVisibility);
	const visibilityMutation = useMutation({
		mutationFn: (input: { attachmentId: string; isInternal: boolean }) =>
			visibilityFn({ data: input }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["idea-attachments", ideaId] });
			toast.success("Visibility updated");
			onChange?.();
		},
		onError: (err: Error) => {
			toast.error(err.message || "Failed to update visibility");
		},
	});

	const handleDelete = async (att: AttachmentRow) => {
		const res = await fetch(`/api/attachments/${att.id}`, { method: "DELETE" });
		if (res.ok) {
			toast.success(`${att.filename} deleted`);
			queryClient.invalidateQueries({ queryKey: ["idea-attachments", ideaId] });
			onChange?.();
		} else {
			toast.error("Failed to delete file");
		}
	};

	const columns: ColumnDef<AttachmentRow, unknown>[] = [
		{
			accessorKey: "filename",
			header: ({ column }) => <SortableHeader column={column}>File</SortableHeader>,
			cell: ({ row }) => {
				const f = row.original;
				return (
					<a
						href={`/api/attachments/${f.id}`}
						target="_blank"
						rel="noopener noreferrer"
						className="flex min-w-0 items-center gap-2 hover:text-primary"
					>
						<FileIcon contentType={f.contentType} />
						<span className="min-w-0 truncate font-medium hover:underline">{f.filename}</span>
					</a>
				);
			},
		},
		{
			accessorKey: "uploadedBy",
			header: ({ column }) => <SortableHeader column={column}>Uploaded by</SortableHeader>,
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">{row.original.uploadedBy}</span>
			),
		},
		{
			accessorKey: "createdAt",
			header: ({ column }) => <SortableHeader column={column}>Uploaded</SortableHeader>,
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">
					{formatDistanceToNow(new Date(row.original.createdAt), { addSuffix: true })}
				</span>
			),
			sortingFn: (a, b) =>
				new Date(a.original.createdAt).getTime() - new Date(b.original.createdAt).getTime(),
		},
		{
			accessorKey: "sizeBytes",
			header: ({ column }) => <SortableHeader column={column}>Size</SortableHeader>,
			cell: ({ row }) => (
				<span className="text-sm text-muted-foreground">
					{formatFileSize(row.original.sizeBytes)}
				</span>
			),
		},
		{
			accessorKey: "isInternal",
			header: "Visibility",
			cell: ({ row }) =>
				row.original.isInternal ? (
					<Badge variant="outline" className="gap-1 border-0 bg-muted/70 text-muted-foreground">
						<Lock className="size-3" />
						Private
					</Badge>
				) : (
					<Badge variant="outline" className="gap-1 border-0">
						<Eye className="size-3" />
						Public
					</Badge>
				),
			filterFn: (row, _id, value) =>
				value === "all" ||
				(value === "internal" ? row.original.isInternal : !row.original.isInternal),
		},
		{
			id: "actions",
			cell: ({ row }) => {
				const f = row.original;
				const ownsFile = f.uploadedById === currentUserId;
				const canChangeVisibility = isAdmin || ownsFile;
				const canDelete = isAdmin || ownsFile;

				return (
					<div className="flex justify-end">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="ghost" size="icon" className="size-7">
									<MoreHorizontal className="size-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-44">
								<DropdownMenuItem asChild>
									<a href={`/api/attachments/${f.id}`} target="_blank" rel="noopener noreferrer">
										<Download className="mr-2 size-3.5" />
										Download
									</a>
								</DropdownMenuItem>
								{canChangeVisibility && (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											onClick={() =>
												visibilityMutation.mutate({
													attachmentId: f.id,
													isInternal: !f.isInternal,
												})
											}
										>
											{f.isInternal ? (
												<>
													<Eye className="mr-2 size-3.5" />
													Make public
												</>
											) : (
												<>
													<EyeOff className="mr-2 size-3.5" />
													Make private
												</>
											)}
										</DropdownMenuItem>
									</>
								)}
								{canDelete && !readOnly && (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											className="text-destructive focus:text-destructive"
											onClick={() => handleDelete(f)}
										>
											<Trash2 className="mr-2 size-3.5" />
											Delete
										</DropdownMenuItem>
									</>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				);
			},
		},
	];

	// Hide the Visibility column for submitters — they never see private files
	// and only see "Public" on every row, which is just noise.
	const visibleColumns = isOwner ? columns : columns.filter((c) => c.id !== "isInternal");

	return (
		<div className="space-y-4">
			{!readOnly && (
				<div className="space-y-2">
					{isOwner && (
						<div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-muted/70 px-2 py-1 text-xs text-muted-foreground">
							<Lock className="size-3.5 shrink-0" />
							<span>
								Files default to private. Use the file's{" "}
								<MoreHorizontal className="inline size-3.5 align-text-bottom" /> menu to share with
								the submitter.
							</span>
						</div>
					)}
					<DropZone
						ideaId={ideaId}
						userId={currentUserId}
						existingFiles={[]}
						onUpload={() => {
							queryClient.invalidateQueries({ queryKey: ["idea-attachments", ideaId] });
							onChange?.();
						}}
					/>
				</div>
			)}

			{attachments.length === 0 ? (
				<p className="py-6 text-center text-sm text-muted-foreground">No attachments yet.</p>
			) : (
				<DataTable
					columns={visibleColumns}
					data={attachments}
					searchPlaceholder="Search files..."
					searchColumn="filename"
					facetedFilters={
						isOwner
							? [
									{
										columnId: "isInternal",
										label: "Visibility",
										options: [
											{ value: "all", label: "All" },
											{ value: "public", label: "Public" },
											{ value: "internal", label: "Private" },
										],
									},
								]
							: undefined
					}
					pageSize={10}
				/>
			)}
		</div>
	);
}
