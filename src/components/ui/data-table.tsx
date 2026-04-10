"use client";

import {
	type ColumnDef,
	type ColumnFiltersState,
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
	columns,
	data,
	searchPlaceholder = "Search...",
	searchColumn,
	facetedFilters = [],
	onRowClick,
	rowClassName,
	pageSize = 20,
	toolbar,
}: DataTableProps<TData>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [globalFilter, setGlobalFilter] = useState("");

	const table = useReactTable({
		data,
		columns,
		state: { sorting, columnFilters, globalFilter },
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onGlobalFilterChange: setGlobalFilter,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: { pagination: { pageSize } },
	});

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

				{toolbar && <div className="ml-auto">{toolbar}</div>}
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
