"use client";

import {
	type ColumnDef,
	type ColumnFiltersState,
	type RowSelectionState,
	type SortingState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { cn } from "#/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────

interface FacetedFilter {
	columnId: string;
	label: string;
	options: { label: string; value: string }[];
}

interface DataTableProps<TData> {
	columns: ColumnDef<TData, unknown>[];
	data: TData[];
	searchPlaceholder?: string;
	searchColumn?: string;
	facetedFilters?: FacetedFilter[];
	onRowClick?: (row: TData) => void;
	rowClassName?: (row: TData) => string;
	pageSize?: number;
	toolbar?: React.ReactNode;
	enableSelection?: boolean;
	rowSelection?: RowSelectionState;
	onRowSelectionChange?: (selection: RowSelectionState) => void;
	getRowId?: (row: TData) => string;
	selectionToolbar?: (selectedCount: number) => React.ReactNode;
}

// ── Sortable header helper ────────────────────────────────────────────────

export function SortableHeader({
	column,
	children,
}: {
	column: { toggleSorting: (desc: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			className="flex items-center gap-1 hover:text-foreground"
			onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
		>
			{children}
			<ArrowUpDown className="size-3.5 text-muted-foreground/50" />
		</button>
	);
}

// ── Component ─────────────────────────────────────────────────────────────

export function DataTable<TData>({
	columns: userColumns,
	data,
	searchPlaceholder = "Search...",
	searchColumn,
	facetedFilters = [],
	onRowClick,
	rowClassName,
	pageSize = 20,
	toolbar,
	enableSelection,
	rowSelection: controlledRowSelection,
	onRowSelectionChange,
	getRowId,
	selectionToolbar,
}: DataTableProps<TData>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [globalFilter, setGlobalFilter] = useState("");
	const [internalRowSelection, setInternalRowSelection] = useState<RowSelectionState>({});

	const rowSelection = controlledRowSelection ?? internalRowSelection;
	const setRowSelection = onRowSelectionChange ?? setInternalRowSelection;

	// Prepend checkbox column if selection enabled
	const columns = enableSelection
		? [
				{
					id: "select",
					header: ({ table: t }: { table: { getIsAllPageRowsSelected: () => boolean; toggleAllPageRowsSelected: (v: boolean) => void } }) => (
						<input
							type="checkbox"
							checked={t.getIsAllPageRowsSelected()}
							onChange={(e) => t.toggleAllPageRowsSelected(e.target.checked)}
							className="size-4 rounded border-input"
						/>
					),
					cell: ({ row }: { row: { getIsSelected: () => boolean; toggleSelected: (v: boolean) => void } }) => (
						<input
							type="checkbox"
							checked={row.getIsSelected()}
							onChange={(e) => {
								e.stopPropagation();
								row.toggleSelected(e.target.checked);
							}}
							className="size-4 rounded border-input"
							onClick={(e) => e.stopPropagation()}
						/>
					),
					size: 40,
				} as ColumnDef<TData, unknown>,
				...userColumns,
			]
		: userColumns;

	const table = useReactTable({
		data,
		columns,
		getRowId,
		state: { sorting, columnFilters, globalFilter, rowSelection },
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onGlobalFilterChange: setGlobalFilter,
		onRowSelectionChange: (updater) => {
			const next = typeof updater === "function" ? updater(rowSelection) : updater;
			setRowSelection(next);
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: { pagination: { pageSize } },
	});

	const selectedCount = Object.keys(rowSelection).length;

	const hasActiveFilters = globalFilter || columnFilters.length > 0;

	return (
		<div className="space-y-3">
			{/* Toolbar: search + filters */}
			<div className="flex flex-wrap items-center gap-2">
				<div className="relative flex-1 sm:max-w-xs">
					<Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder={searchPlaceholder}
						value={searchColumn ? (table.getColumn(searchColumn)?.getFilterValue() as string) ?? "" : globalFilter}
						onChange={(e) => {
							if (searchColumn) {
								table.getColumn(searchColumn)?.setFilterValue(e.target.value);
							} else {
								setGlobalFilter(e.target.value);
							}
						}}
						className="h-9 pl-8"
					/>
				</div>

				{facetedFilters.map((filter) => {
					const currentValue = (table.getColumn(filter.columnId)?.getFilterValue() as string) ?? "";
					return (
						<Select
							key={filter.columnId}
							value={currentValue || "__all__"}
							onValueChange={(v) =>
								table.getColumn(filter.columnId)?.setFilterValue(v === "__all__" ? "" : v)
							}
						>
							<SelectTrigger className="h-9 w-[140px]">
								<SelectValue placeholder={filter.label} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__all__">All {filter.label}</SelectItem>
								{filter.options.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					);
				})}

				{hasActiveFilters && (
					<Button
						variant="ghost"
						size="sm"
						className="h-9"
						onClick={() => {
							setGlobalFilter("");
							setColumnFilters([]);
						}}
					>
						<X className="mr-1 size-3.5" />
						Clear
					</Button>
				)}

				{selectedCount > 0 && selectionToolbar && (
				<div className="ml-auto flex items-center gap-2">{selectionToolbar(selectedCount)}</div>
			)}
			{selectedCount === 0 && toolbar && <div className="ml-auto">{toolbar}</div>}
			</div>

			{/* Table */}
			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => (
								<TableHead key={header.id}>
									{header.isPlaceholder
										? null
										: flexRender(header.column.columnDef.header, header.getContext())}
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows.length > 0 ? (
						table.getRowModel().rows.map((row) => (
							<TableRow
								key={row.id}
								className={cn(
									onRowClick && "cursor-pointer",
									rowClassName?.(row.original),
								)}
								onClick={() => onRowClick?.(row.original)}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id}>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					) : (
						<TableRow>
							<TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
								No results found.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>

			{/* Pagination */}
			{table.getPageCount() > 1 && (
				<div className="flex items-center justify-between text-sm text-muted-foreground">
					<span>
						{table.getFilteredRowModel().rows.length} idea{table.getFilteredRowModel().rows.length === 1 ? "" : "s"}
					</span>
					<div className="flex items-center gap-2">
						<span>
							Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
						</span>
						<Button
							variant="outline"
							size="icon"
							className="size-8"
							onClick={() => table.previousPage()}
							disabled={!table.getCanPreviousPage()}
						>
							<ChevronLeft className="size-4" />
						</Button>
						<Button
							variant="outline"
							size="icon"
							className="size-8"
							onClick={() => table.nextPage()}
							disabled={!table.getCanNextPage()}
						>
							<ChevronRight className="size-4" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
