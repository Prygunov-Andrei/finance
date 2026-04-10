import React, { useMemo, useRef, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEstimateApi } from '@/lib/api/estimate-api-context';
import { formatCurrency } from '@/lib/utils';
import { createSelectColumn } from '@/components/ui/data-table';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Loader2, FolderOpen, ChevronUp, ChevronDown, ArrowRightFromLine } from 'lucide-react';
import { toast } from 'sonner';
import { EstimateImportDialog } from '../EstimateImportDialog';
import { AutoMatchDialog } from '../AutoMatchDialog';
import { WorkMatchingDialog } from '../work-matching/WorkMatchingDialog';
import { WorkItemPicker } from '../work-matching/WorkItemPicker';
import { type EstimateItemsEditorProps, type TableRow } from './types';
import { useEstimateItems } from './useEstimateItems';
import { useEditorColumns } from './useEditorColumns';
import { EditorToolbar } from './EditorToolbar';
import { BulkMarkupDialog, type BulkMarkupData } from './BulkMarkupDialog';

export const EstimateItemsEditor: React.FC<EstimateItemsEditorProps> = ({
  estimateId,
  readOnly = false,
  columnConfig,
  onOpenColumnConfig,
  projectFiles,
  onColumnResize,
  initialColumnSizing,
}) => {
  const estimateApi = useEstimateApi();
  const queryClient = useQueryClient();
  const [isBulkMarkupOpen, setIsBulkMarkupOpen] = useState(false);
  const state = useEstimateItems(estimateId, readOnly, columnConfig);

  const bulkMarkupMutation = useMutation({
    mutationFn: (data: BulkMarkupData) => estimateApi.bulkSetMarkup(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      queryClient.invalidateQueries({ queryKey: ['estimate', String(estimateId)] });
      state.setRowSelection({});
      toast.success(`Наценка применена к ${result.updated} строкам`);
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  // Work item picker state
  const [workItemPickerItem, setWorkItemPickerItem] = useState<{ id: number; name: string } | null>(null);

  // Refs for stable column definitions — cell renderers read latest state without causing column rebuild
  const stateRef = useRef(state);
  stateRef.current = state;

  // Pre-compute isFirst/isLast per item — O(n) instead of O(n²) per render
  const boundaryMapRef = useRef<Map<number, { isFirst: boolean; isLast: boolean }>>(new Map());
  const boundaryMap = useMemo(() => {
    const map = new Map<number, { isFirst: boolean; isLast: boolean }>();
    const bySection = new Map<number, { id: number; sort_order: number; item_number: number }[]>();
    for (const item of state.items) {
      let list = bySection.get(item.section);
      if (!list) { list = []; bySection.set(item.section, list); }
      list.push({ id: item.id, sort_order: item.sort_order, item_number: item.item_number });
    }
    for (const sectionItems of bySection.values()) {
      sectionItems.sort((a, b) => a.sort_order - b.sort_order || a.item_number - b.item_number);
      for (let i = 0; i < sectionItems.length; i++) {
        map.set(sectionItems[i].id, { isFirst: i === 0, isLast: i === sectionItems.length - 1 });
      }
    }
    return map;
  }, [state.items]);
  boundaryMapRef.current = boundaryMap;

  const dataColumns = useEditorColumns({
    readOnly,
    effectiveConfig: state.effectiveConfig,
    displayRows: state.displayRows,
    items: state.items,
    handleCellEdit: state.handleCellEdit,
  });

  const columns = useMemo<ColumnDef<TableRow, any>[]>(() => {
    const cols: ColumnDef<TableRow, any>[] = [];

    if (!readOnly) {
      cols.push(createSelectColumn<TableRow>());

      // Section toggle column (promote/demote)
      cols.push({
        id: 'section_toggle',
        header: '',
        size: 36,
        enableResizing: false,
        cell: ({ row }) => {
          const isSection = row.original._isSection;
          const sectionId = row.original._sectionId;

          if (isSection) {
            return (
              <button
                onClick={() => stateRef.current.demoteMutation.mutate(sectionId!)}
                className="p-1 rounded bg-blue-100 dark:bg-blue-900/30 text-primary hover:bg-blue-200 transition-colors"
                title="Снять раздел"
              >
                <FolderOpen className="h-4 w-4" />
              </button>
            );
          }

          return (
            <button
              onClick={() => stateRef.current.promoteMutation.mutate(row.original.id)}
              className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Назначить разделом"
            >
              <FolderOpen className="h-4 w-4" />
            </button>
          );
        },
      });

      // Move up/down column
      cols.push({
        id: 'move_order',
        header: '',
        size: 44,
        enableResizing: false,
        cell: ({ row }) => {
          if (row.original._isSection) return null;

          const itemId = row.original.id;

          const bounds = boundaryMapRef.current.get(itemId);
          const isFirst = bounds?.isFirst ?? true;
          const isLast = bounds?.isLast ?? true;

          return (
            <div className="flex flex-col gap-0">
              <button
                onClick={() => stateRef.current.moveMutation.mutate({ itemId, direction: 'up' })}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-20 disabled:cursor-default"
                title="Переместить вверх"
                disabled={isFirst}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => stateRef.current.moveMutation.mutate({ itemId, direction: 'down' })}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-20 disabled:cursor-default"
                title="Переместить вниз"
                disabled={isLast}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        },
      });
    }

    // Data columns from useEditorColumns
    cols.push(...dataColumns);

    // Work item column — clickable to open WorkItemPicker
    cols.push({
      id: 'work_item_col',
      header: 'Работа',
      size: 180,
      cell: ({ row }) => {
        if (row.original._isSection) return null;
        const workItemName = row.original.work_item_name;
        if (readOnly) {
          return <span className="text-xs truncate">{workItemName || ''}</span>;
        }
        return (
          <button
            className="text-xs truncate max-w-[170px] text-left hover:text-primary hover:underline transition-colors block"
            onClick={() => {
              setWorkItemPickerItem({ id: row.original.id, name: row.original.name });
            }}
            title={workItemName || 'Назначить работу'}
          >
            {workItemName || <span className="text-muted-foreground italic">назначить...</span>}
          </button>
        );
      },
    });

    if (!readOnly) {
      cols.push({
        id: 'actions',
        header: '',
        size: 40,
        enableResizing: false,
        cell: ({ row }) => {
          if (row.original._isSection) return null;
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => stateRef.current.deleteItemMutation.mutate(row.original.id)}
              aria-label="Удалить строку"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          );
        },
      });
    }

    return cols;
  }, [readOnly, dataColumns]);

  if (state.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <EditorToolbar
          itemsCount={state.items.length}
          selectedCount={state.selectedCount}
          moveTargetPosition={state.moveTargetPosition}
          onMoveTargetPositionChange={state.setMoveTargetPosition}
          onAddClick={() => state.setAddDialogOpen(true)}
          onPasteClick={() => state.setPasteDialogOpen(true)}
          onImportClick={() => state.setImportDialogOpen(true)}
          onAutoMatchClick={() => state.setAutoMatchOpen(true)}
          onWorkMatchingClick={() => state.setWorkMatchingOpen(true)}
          onMoveSelected={state.handleMoveSelected}
          onMergeSelected={state.handleMergeSelected}
          onDeleteSelected={state.handleDeleteSelected}
          onBulkMarkupClick={() => setIsBulkMarkupOpen(true)}
          onOpenColumnConfig={onOpenColumnConfig}
          bulkMovePending={state.bulkMoveMutation.isPending}
          mergePending={state.mergeItemsMutation.isPending}
        />
      )}

      <DataTable
        columns={columns}
        data={state.displayRows}
        enableSorting
        enableFiltering
        enableRowSelection={!readOnly}
        enableVirtualization
        enableColumnResizing
        initialColumnSizing={initialColumnSizing}
        onColumnSizingChanged={onColumnResize}
        globalFilter={state.globalFilter}
        onGlobalFilterChange={state.setGlobalFilter}
        onRowSelectionChange={state.setRowSelection}
        onCellEdit={state.handleCellEdit}
        getRowId={(row) => String((row as TableRow).id)}
        rowClassName={(row) => {
          const original = row.original as TableRow;
          if (original._isSection) {
            return 'bg-primary/10 font-semibold';
          }
          return original.is_analog ? 'bg-amber-50 dark:bg-amber-900/20' : undefined;
        }}
        estimatedRowHeight={40}
        footerContent={
          <div className="flex items-center gap-6 py-2 font-medium">
            {state.totals.aggCols.map((col) => (
              <span key={col.key}>
                {col.label}: {formatCurrency(state.totals.sums[col.key])}
              </span>
            ))}
          </div>
        }
        onRowContextMenu={!readOnly && state.sections.length > 1 ? (e, row) => {
          const original = row.original as TableRow;
          if (original._isSection) return;
          e.preventDefault();
          state.setContextMenu({
            x: e.clientX,
            y: e.clientY,
            itemId: original.id,
            sectionId: original.section,
          });
        } : undefined}
        emptyMessage="Нет строк сметы. Добавьте строки вручную или импортируйте из Excel/PDF."
      />

      {/* Context menu: move to section */}
      {state.contextMenu && (
        <div
          className="fixed z-50 min-w-48 rounded-md border bg-popover p-1 shadow-md"
          style={{ left: state.contextMenu.x, top: state.contextMenu.y }}
          onMouseLeave={() => state.setContextMenu(null)}
        >
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Переместить в раздел
          </div>
          {state.sections
            .filter((s) => s.id !== state.contextMenu!.sectionId)
            .map((s) => (
              <button
                key={s.id}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                onClick={() => {
                  state.moveToSectionMutation.mutate({
                    itemId: state.contextMenu!.itemId,
                    targetSectionId: s.id,
                  });
                  state.setContextMenu(null);
                }}
              >
                <ArrowRightFromLine className="h-3.5 w-3.5" />
                {s.name}
              </button>
            ))}
        </div>
      )}

      {/* Add Item Dialog */}
      <Dialog open={state.isAddDialogOpen} onOpenChange={state.setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить строку сметы</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Раздел</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={state.newItemForm.section || ''}
                onChange={(e) =>
                  state.setNewItemForm((f) => ({ ...f, section: Number(e.target.value) }))
                }
              >
                {state.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Наименование *</Label>
              <Input
                value={state.newItemForm.name || ''}
                onChange={(e) => state.setNewItemForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Кабель ВВГнг 3x1.5"
              />
            </div>
            <div>
              <Label>Модель</Label>
              <Input
                value={state.newItemForm.model_name || ''}
                onChange={(e) => state.setNewItemForm((f) => ({ ...f, model_name: e.target.value }))}
                placeholder="NYM 3x1.5"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Ед. изм.</Label>
                <Input
                  value={state.newItemForm.unit || 'шт'}
                  onChange={(e) => state.setNewItemForm((f) => ({ ...f, unit: e.target.value }))}
                />
              </div>
              <div>
                <Label>Кол-во</Label>
                <Input
                  type="number"
                  value={state.newItemForm.quantity || '1'}
                  onChange={(e) => state.setNewItemForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div>
                <Label>Цена мат.</Label>
                <Input
                  type="number"
                  value={state.newItemForm.material_unit_price || '0'}
                  onChange={(e) =>
                    state.setNewItemForm((f) => ({ ...f, material_unit_price: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>Цена работы</Label>
              <Input
                type="number"
                value={state.newItemForm.work_unit_price || '0'}
                onChange={(e) =>
                  state.setNewItemForm((f) => ({ ...f, work_unit_price: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => state.setAddDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={state.handleAddItem} disabled={state.createItemMutation.isPending}>
              {state.createItemMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AutoMatch Dialog */}
      <AutoMatchDialog
        open={state.isAutoMatchOpen}
        onOpenChange={state.setAutoMatchOpen}
        estimateId={estimateId}
      />

      {/* Async Work Matching Dialog */}
      <WorkMatchingDialog
        open={state.isWorkMatchingOpen}
        onOpenChange={state.setWorkMatchingOpen}
        estimateId={estimateId}
      />

      {/* Import from file Dialog */}
      <EstimateImportDialog
        open={state.isImportDialogOpen}
        onOpenChange={state.setImportDialogOpen}
        estimateId={estimateId}
        projectFiles={projectFiles}
      />

      {/* Bulk Markup Dialog */}
      <BulkMarkupDialog
        open={isBulkMarkupOpen}
        onOpenChange={setIsBulkMarkupOpen}
        selectedItemIds={Object.keys(state.rowSelection).filter((k) => state.rowSelection[k]).map(Number).filter((id) => id > 0)}
        onApply={(data) => bulkMarkupMutation.mutate(data)}
      />

      {/* Paste from Excel Dialog */}
      <Dialog open={state.isPasteDialogOpen} onOpenChange={state.setPasteDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Вставить из Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Скопируйте строки из Excel (формат: Наименование, Модель, Ед.изм., Кол-во, Цена мат., Цена раб.)
              и вставьте в поле ниже.
            </p>
            <textarea
              className="w-full h-48 border rounded-md p-3 text-sm font-mono bg-background resize-none"
              placeholder="Наименование&#9;Модель&#9;шт&#9;10&#9;500&#9;200"
              value={state.pasteText}
              onChange={(e) => state.setPasteText(e.target.value)}
            />
            {state.pasteText.trim() && (
              <p className="text-sm text-muted-foreground">
                Распознано строк: {state.pasteText.trim().split('\n').filter((l) => l.split('\t').length >= 2 && l.split('\t')[0]?.trim()).length}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => state.setPasteDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={state.handlePasteFromExcel} disabled={state.bulkCreateMutation.isPending}>
              {state.bulkCreateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Импортировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Work Item Picker — inline assignment */}
      <WorkItemPicker
        open={workItemPickerItem !== null}
        onOpenChange={(open) => { if (!open) setWorkItemPickerItem(null); }}
        onSelect={async (wi) => {
          if (!workItemPickerItem) return;
          try {
            await estimateApi.updateEstimateItem(workItemPickerItem.id, {
              work_item: wi.id,
            });
            queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
            toast.success(`Работа "${wi.name}" назначена`);
          } catch (err) {
            toast.error(`Ошибка: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
          }
          setWorkItemPickerItem(null);
        }}
        itemName={workItemPickerItem?.name}
      />

    </div>
  );
};
