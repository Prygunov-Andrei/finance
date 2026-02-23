import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
  type GroupingState,
  type ExpandedState,
  type Row,
  type Table as TanstackTable,
  type CellContext,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from './utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
} from './table';
import { Input } from './input';
import { Checkbox } from './checkbox';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X } from 'lucide-react';

export type EditableCellMeta = {
  editable?: boolean;
  type?: 'text' | 'number' | 'select';
  options?: Array<{ value: string; label: string }>;
};

export type DataTableProps<TData> = {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  enableSorting?: boolean;
  enableFiltering?: boolean;
  enableRowSelection?: boolean;
  enableGrouping?: boolean;
  enableVirtualization?: boolean;
  grouping?: string[];
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  onCellEdit?: (rowIndex: number, columnId: string, value: unknown) => void;
  rowClassName?: (row: Row<TData>) => string | undefined;
  footerContent?: React.ReactNode;
  estimatedRowHeight?: number;
  overscan?: number;
  getRowId?: (row: TData) => string;
  className?: string;
  tableInstance?: React.MutableRefObject<TanstackTable<TData> | null>;
  emptyMessage?: string;
};

function EditableCell<TData>({
  cellContext,
  onEdit,
}: {
  cellContext: CellContext<TData, unknown>;
  onEdit?: (rowIndex: number, columnId: string, value: unknown) => void;
}) {
  const meta = cellContext.column.columnDef.meta as EditableCellMeta | undefined;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartEdit = useCallback(() => {
    if (!meta?.editable) return;
    setEditValue(String(cellContext.getValue() ?? ''));
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [meta?.editable, cellContext]);

  const handleFinishEdit = useCallback(() => {
    setIsEditing(false);
    const oldValue = String(cellContext.getValue() ?? '');
    if (editValue !== oldValue && onEdit) {
      onEdit(cellContext.row.index, cellContext.column.id, editValue);
    }
  }, [editValue, cellContext, onEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleFinishEdit();
      if (e.key === 'Escape') setIsEditing(false);
    },
    [handleFinishEdit],
  );

  if (!meta?.editable) {
    return <>{flexRender(cellContext.column.columnDef.cell, cellContext)}</>;
  }

  if (isEditing) {
    if (meta.type === 'select' && meta.options) {
      return (
        <select
          className="w-full border rounded px-1 py-0.5 text-sm bg-background"
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
          }}
          onBlur={handleFinishEdit}
          onKeyDown={handleKeyDown}
          autoFocus
        >
          {meta.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <Input
        ref={inputRef}
        type={meta.type === 'number' ? 'number' : 'text'}
        className="h-7 px-1 py-0 text-sm"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleFinishEdit}
        onKeyDown={handleKeyDown}
        step={meta.type === 'number' ? 'any' : undefined}
      />
    );
  }

  return (
    <div
      className="cursor-pointer hover:bg-muted/60 rounded px-1 py-0.5 min-h-[28px] flex items-center"
      onClick={handleStartEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleStartEdit();
      }}
      tabIndex={0}
      role="button"
      aria-label={`Редактировать ${cellContext.column.id}`}
    >
      {flexRender(cellContext.column.columnDef.cell, cellContext)}
    </div>
  );
}

export function createSelectColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Выделить все"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Выделить строку"
      />
    ),
    size: 40,
    enableSorting: false,
    enableGrouping: false,
  };
}

export function DataTable<TData>({
  columns,
  data,
  enableSorting = true,
  enableFiltering = false,
  enableRowSelection = false,
  enableGrouping = false,
  enableVirtualization = false,
  grouping: initialGrouping = [],
  globalFilter: externalGlobalFilter,
  onGlobalFilterChange,
  onRowSelectionChange,
  onCellEdit,
  rowClassName,
  footerContent,
  estimatedRowHeight = 40,
  overscan = 10,
  getRowId,
  className,
  tableInstance,
  emptyMessage = 'Нет данных',
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [internalGlobalFilter, setInternalGlobalFilter] = useState('');
  const [groupingState, setGroupingState] = useState<GroupingState>(initialGrouping);
  const [expanded, setExpanded] = useState<ExpandedState>(true);

  const globalFilterValue = externalGlobalFilter ?? internalGlobalFilter;
  const handleGlobalFilterChange = onGlobalFilterChange ?? setInternalGlobalFilter;

  const handleRowSelectionChange = useCallback(
    (updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState)) => {
      const newSelection = typeof updater === 'function' ? updater(rowSelection) : updater;
      setRowSelection(newSelection);
      onRowSelectionChange?.(newSelection);
    },
    [rowSelection, onRowSelectionChange],
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter: globalFilterValue,
      rowSelection,
      grouping: groupingState,
      expanded,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: handleGlobalFilterChange,
    onRowSelectionChange: handleRowSelectionChange,
    onGroupingChange: setGroupingState,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getFilteredRowModel: enableFiltering ? getFilteredRowModel() : undefined,
    getGroupedRowModel: enableGrouping ? getGroupedRowModel() : undefined,
    getExpandedRowModel: enableGrouping ? getExpandedRowModel() : undefined,
    enableRowSelection,
    enableGrouping,
    getRowId,
  });

  if (tableInstance) {
    tableInstance.current = table;
  }

  const { rows } = table.getRowModel();
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan,
    enabled: enableVirtualization,
  });

  const virtualRows = enableVirtualization ? virtualizer.getVirtualItems() : null;
  const totalSize = enableVirtualization ? virtualizer.getTotalSize() : 0;

  const headerGroups = table.getHeaderGroups();
  const hasFooter = columns.some((col) => 'footer' in col && col.footer);

  const displayRows = useMemo(() => {
    if (!enableVirtualization) return rows;
    return virtualRows?.map((vr) => rows[vr.index]) ?? [];
  }, [enableVirtualization, rows, virtualRows]);

  return (
    <div className={cn('space-y-2', className)}>
      {enableFiltering && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск..."
              value={globalFilterValue}
              onChange={(e) => handleGlobalFilterChange(e.target.value)}
              className="pl-8 pr-8"
            />
            {globalFilterValue && (
              <button
                onClick={() => handleGlobalFilterChange('')}
                className="absolute right-2 top-2.5"
                aria-label="Очистить поиск"
              >
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          <span className="text-sm text-muted-foreground">
            {rows.length} из {data.length}
          </span>
        </div>
      )}

      <div
        ref={parentRef}
        className={cn(
          'rounded-md border overflow-auto',
          enableVirtualization && 'max-h-[70vh]',
        )}
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            {headerGroups.map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className={cn(
                      enableSorting && header.column.getCanSort() && 'cursor-pointer select-none',
                    )}
                    onClick={
                      enableSorting && header.column.getCanSort()
                        ? header.column.getToggleSortingHandler()
                        : undefined
                    }
                    tabIndex={enableSorting && header.column.getCanSort() ? 0 : undefined}
                    onKeyDown={
                      enableSorting && header.column.getCanSort()
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              header.column.getToggleSortingHandler()?.(e);
                            }
                          }
                        : undefined
                    }
                    aria-label={
                      enableSorting && header.column.getCanSort()
                        ? `Сортировать по ${String(header.column.columnDef.header)}`
                        : undefined
                    }
                  >
                    {header.isPlaceholder ? null : (
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {enableSorting && header.column.getCanSort() && (
                          <span className="ml-1">
                            {header.column.getIsSorted() === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <ArrowDown className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {enableVirtualization && virtualRows && (
              <tr style={{ height: `${virtualRows[0]?.start ?? 0}px` }}>
                <td />
              </tr>
            )}

            {displayRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              displayRows.map((row) => {
                if (!row) return null;
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    className={rowClassName?.(row)}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as EditableCellMeta | undefined;
                      return (
                        <TableCell key={cell.id} style={{ width: cell.column.getSize() }}>
                          {meta?.editable ? (
                            <EditableCell cellContext={cell.getContext()} onEdit={onCellEdit} />
                          ) : cell.getIsGrouped() ? (
                            <button
                              onClick={row.getToggleExpandedHandler()}
                              className="flex items-center gap-1 font-medium"
                              aria-label={row.getIsExpanded() ? 'Свернуть группу' : 'Развернуть группу'}
                            >
                              {row.getIsExpanded() ? '▼' : '▶'}{' '}
                              {flexRender(cell.column.columnDef.cell, cell.getContext())} (
                              {row.subRows.length})
                            </button>
                          ) : cell.getIsAggregated() ? (
                            flexRender(
                              cell.column.columnDef.aggregatedCell ?? cell.column.columnDef.cell,
                              cell.getContext(),
                            )
                          ) : cell.getIsPlaceholder() ? null : (
                            flexRender(cell.column.columnDef.cell, cell.getContext())
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            )}

            {enableVirtualization && virtualRows && (
              <tr
                style={{
                  height: `${totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)}px`,
                }}
              >
                <td />
              </tr>
            )}
          </TableBody>

          {(hasFooter || footerContent) && (
            <TableFooter>
              {hasFooter &&
                table.getFooterGroups().map((footerGroup) => (
                  <TableRow key={footerGroup.id}>
                    {footerGroup.headers.map((header) => (
                      <TableCell key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.footer, header.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {footerContent && (
                <TableRow>
                  <TableCell colSpan={columns.length}>{footerContent}</TableCell>
                </TableRow>
              )}
            </TableFooter>
          )}
        </Table>
      </div>

      {enableRowSelection && (
        <div className="text-sm text-muted-foreground">
          Выбрано {table.getFilteredSelectedRowModel().rows.length} из{' '}
          {table.getFilteredRowModel().rows.length}
        </div>
      )}
    </div>
  );
}

export type { ColumnDef, Row, TanstackTable as TableInstance, CellContext };
