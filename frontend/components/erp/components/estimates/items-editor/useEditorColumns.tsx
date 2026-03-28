import { useMemo, useRef } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { type ColumnDef as ColumnDefAPI } from '@/lib/api';
import { type EstimateItem } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { computeAllFormulas } from '../../../lib/formula-engine';
import { type TableRow } from './types';

type UseEditorColumnsParams = {
  readOnly: boolean;
  effectiveConfig: ColumnDefAPI[];
  displayRows: TableRow[];
  items: EstimateItem[];
  handleCellEdit: (rowIndex: number, columnId: string, value: unknown) => void;
};

/**
 * Builds column definitions for builtin, formula, and custom column types.
 * Action columns (select, section_toggle, move_order, delete) are added by the orchestrator.
 */
export function useEditorColumns({
  readOnly,
  effectiveConfig,
  displayRows,
  items,
  handleCellEdit,
}: UseEditorColumnsParams): ColumnDef<TableRow, any>[] {
  // Refs for stable column definitions — cell renderers read latest data without causing column rebuild
  const displayRowsRef = useRef(displayRows);
  const handleCellEditRef = useRef(handleCellEdit);
  displayRowsRef.current = displayRows;
  handleCellEditRef.current = handleCellEdit;

  return useMemo<ColumnDef<TableRow, any>[]>(() => {
    const cols: ColumnDef<TableRow, any>[] = [];

    for (const colDef of effectiveConfig) {
      if (!colDef.visible) continue;

      if (colDef.type === 'builtin') {
        const field = colDef.builtin_field || colDef.key;
        const isNumber = ['quantity', 'material_unit_price', 'work_unit_price'].includes(field);
        const isCurrency = [
          'material_unit_price', 'work_unit_price',
          'material_total', 'work_total', 'line_total',
          'material_sale_unit_price', 'work_sale_unit_price',
          'material_purchase_total', 'work_purchase_total',
          'material_sale_total', 'work_sale_total',
          'effective_material_markup_percent', 'effective_work_markup_percent',
        ].includes(field);
        const isTotal = [
          'material_total', 'work_total', 'line_total',
          'material_sale_total', 'work_sale_total',
          'material_purchase_total', 'work_purchase_total',
        ].includes(field);
        const isEditable = colDef.editable && !readOnly;

        cols.push({
          accessorKey: field,
          id: colDef.key,
          header: colDef.label,
          size: colDef.width,
          enableSorting: field === 'item_number' || isTotal,
          meta: isEditable ? { editable: true, type: (isNumber ? 'number' : 'text') as 'number' | 'text' } : undefined,
          cell: ({ row, getValue }) => {
            if (row.original._isSection) {
              if (field === 'name') {
                return (
                  <span className="font-semibold text-primary text-sm">
                    {getValue() as string}
                  </span>
                );
              }
              return null;
            }
            const v = getValue();
            if (isCurrency) return field === 'line_total'
              ? <span className="font-medium">{formatCurrency(v as string)}</span>
              : formatCurrency(v as string);
            if (field === 'quantity' && typeof v === 'string') {
              return parseFloat(v).toLocaleString('ru-RU');
            }
            return v as string;
          },
        });
      } else if (colDef.type === 'formula') {
        cols.push({
          id: colDef.key,
          header: colDef.label,
          size: colDef.width,
          accessorFn: (row: TableRow) => {
            if (row._isSection) return null;
            const serverVal = row.computed_values?.[colDef.key];
            if (serverVal != null) return serverVal;
            try {
              const builtinVars: Record<string, number> = {
                item_number: row.item_number || 0,
                quantity: parseFloat(row.quantity) || 0,
                material_unit_price: parseFloat(row.material_unit_price) || 0,
                work_unit_price: parseFloat(row.work_unit_price) || 0,
                material_total: parseFloat(row.material_total) || 0,
                work_total: parseFloat(row.work_total) || 0,
                line_total: parseFloat(row.line_total) || 0,
                material_sale_unit_price: parseFloat(row.material_sale_unit_price) || 0,
                work_sale_unit_price: parseFloat(row.work_sale_unit_price) || 0,
                material_purchase_total: parseFloat(row.material_purchase_total) || 0,
                work_purchase_total: parseFloat(row.work_purchase_total) || 0,
                material_sale_total: parseFloat(row.material_sale_total) || 0,
                work_sale_total: parseFloat(row.work_sale_total) || 0,
                effective_material_markup_percent: parseFloat(row.effective_material_markup_percent) || 0,
                effective_work_markup_percent: parseFloat(row.effective_work_markup_percent) || 0,
              };
              const result = computeAllFormulas(effectiveConfig, builtinVars, row.custom_data || {});
              const val = result[colDef.key];
              return val != null ? String(val) : null;
            } catch {
              return null;
            }
          },
          cell: ({ row, getValue }) => {
            if (row.original._isSection) return null;
            const v = getValue();
            if (v == null) return <span className="text-muted-foreground">—</span>;
            return formatCurrency(String(v));
          },
        });
      } else if (colDef.type === 'custom_number') {
        cols.push({
          id: colDef.key,
          header: colDef.label,
          size: colDef.width,
          accessorFn: (row: TableRow) => row.custom_data?.[colDef.key] ?? '',
          meta: !readOnly && colDef.editable ? { editable: true, type: 'number' as const } : undefined,
          cell: ({ row, getValue }) => {
            if (row.original._isSection) return null;
            const v = getValue() as string;
            if (!v) return '';
            return colDef.decimal_places != null ? formatCurrency(v) : parseFloat(v).toLocaleString('ru-RU');
          },
        });
      } else if (colDef.type === 'custom_text') {
        cols.push({
          id: colDef.key,
          header: colDef.label,
          size: colDef.width,
          accessorFn: (row: TableRow) => row.custom_data?.[colDef.key] ?? '',
          meta: !readOnly && colDef.editable ? { editable: true, type: 'text' as const } : undefined,
          cell: ({ row, getValue }) => {
            if (row.original._isSection) return null;
            return getValue() as string;
          },
        });
      } else if (colDef.type === 'custom_date') {
        cols.push({
          id: colDef.key,
          header: colDef.label,
          size: colDef.width,
          accessorFn: (row: TableRow) => row.custom_data?.[colDef.key] ?? '',
          meta: !readOnly && colDef.editable ? { editable: true, type: 'text' as const } : undefined,
          cell: ({ row, getValue }) => {
            if (row.original._isSection) return null;
            const v = getValue() as string;
            if (!v) return '';
            try { return new Date(v).toLocaleDateString('ru-RU'); } catch { return v; }
          },
        });
      } else if (colDef.type === 'custom_select') {
        cols.push({
          id: colDef.key,
          header: colDef.label,
          size: colDef.width,
          accessorFn: (row: TableRow) => row.custom_data?.[colDef.key] ?? '',
          meta: !readOnly && colDef.editable
            ? { editable: true, type: 'text' as const, selectOptions: colDef.options }
            : undefined,
          cell: ({ row, getValue }) => {
            if (row.original._isSection) return null;
            return getValue() as string;
          },
        });
      } else if (colDef.type === 'custom_checkbox') {
        cols.push({
          id: colDef.key,
          header: colDef.label,
          size: colDef.width,
          accessorFn: (row: TableRow) => row.custom_data?.[colDef.key] === 'true',
          cell: ({ row, getValue }) => {
            if (row.original._isSection) return null;
            const checked = !!getValue();
            if (readOnly || !colDef.editable) return checked ? '✓' : '';
            return (
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const idx = displayRowsRef.current.findIndex((r) => r.id === row.original.id);
                  if (idx >= 0) handleCellEditRef.current(idx, colDef.key, e.target.checked ? 'true' : 'false');
                }}
                className="h-4 w-4"
              />
            );
          },
        });
      }
    }

    return cols;
  }, [readOnly, effectiveConfig]);
}
