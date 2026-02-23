import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef, type RowSelectionState } from '@tanstack/react-table';
import {
  api,
  type EstimateItem,
  type CreateEstimateItemData,
  type EstimateSection,
} from '../../lib/api';
import { formatCurrency } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { DataTable, createSelectColumn } from '../ui/data-table';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Plus, Trash2, ClipboardPaste, Loader2, Upload, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { EstimateImportDialog } from './EstimateImportDialog';
import { AutoMatchDialog } from './AutoMatchDialog';

type EstimateItemsEditorProps = {
  estimateId: number;
  sections: EstimateSection[];
  readOnly?: boolean;
};

const DEBOUNCE_MS = 600;

export const EstimateItemsEditor: React.FC<EstimateItemsEditorProps> = ({
  estimateId,
  sections,
  readOnly = false,
}) => {
  const queryClient = useQueryClient();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [isAddDialogOpen, setAddDialogOpen] = useState(false);
  const [isPasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [isImportDialogOpen, setImportDialogOpen] = useState(false);
  const [isAutoMatchOpen, setAutoMatchOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['estimate-items', estimateId],
    queryFn: () => api.getEstimateItems(estimateId),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const [newItemForm, setNewItemForm] = useState<Partial<CreateEstimateItemData>>({
    estimate: estimateId,
    section: sections[0]?.id,
    name: '',
    unit: 'шт',
    quantity: '1',
    material_unit_price: '0',
    work_unit_price: '0',
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateEstimateItemData> }) =>
      api.updateEstimateItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
    },
    onError: (error) => {
      toast.error(`Ошибка обновления: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const createItemMutation = useMutation({
    mutationFn: (data: CreateEstimateItemData) => api.createEstimateItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      setAddDialogOpen(false);
      setNewItemForm({
        estimate: estimateId,
        section: sections[0]?.id,
        name: '',
        unit: 'шт',
        quantity: '1',
        material_unit_price: '0',
        work_unit_price: '0',
      });
      toast.success('Строка добавлена');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: number) => api.deleteEstimateItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      toast.success('Строка удалена');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const bulkCreateMutation = useMutation({
    mutationFn: (items: CreateEstimateItemData[]) => api.bulkCreateEstimateItems(items),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      setPasteDialogOpen(false);
      setPasteText('');
      toast.success(`Создано ${Array.isArray(created) ? created.length : 0} строк`);
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const handleCellEdit = useCallback(
    (rowIndex: number, columnId: string, value: unknown) => {
      if (readOnly) return;
      const item = items[rowIndex];
      if (!item) return;

      const key = `${item.id}-${columnId}`;
      if (debounceTimers.current[key]) {
        clearTimeout(debounceTimers.current[key]);
      }

      debounceTimers.current[key] = setTimeout(() => {
        updateItemMutation.mutate({
          id: item.id,
          data: { [columnId]: value },
        });
        delete debounceTimers.current[key];
      }, DEBOUNCE_MS);
    },
    [items, readOnly, updateItemMutation],
  );

  const handleDeleteSelected = useCallback(() => {
    const selectedIds = Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((key) => items[Number(key)]?.id)
      .filter(Boolean) as number[];

    if (selectedIds.length === 0) return;

    Promise.all(selectedIds.map((id) => api.deleteEstimateItem(id))).then(() => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      setRowSelection({});
      toast.success(`Удалено ${selectedIds.length} строк`);
    });
  }, [rowSelection, items, queryClient, estimateId]);

  const handlePasteFromExcel = useCallback(() => {
    if (!pasteText.trim()) return;
    const lines = pasteText.trim().split('\n');
    const newItems: CreateEstimateItemData[] = lines
      .map((line) => {
        const cols = line.split('\t');
        if (cols.length < 2) return null;
        return {
          estimate: estimateId,
          section: sections[0]?.id ?? 0,
          name: cols[0]?.trim() || '',
          model_name: cols[1]?.trim() || '',
          unit: cols[2]?.trim() || 'шт',
          quantity: cols[3]?.trim() || '1',
          material_unit_price: cols[4]?.trim() || '0',
          work_unit_price: cols[5]?.trim() || '0',
        } satisfies CreateEstimateItemData;
      })
      .filter((x): x is CreateEstimateItemData => x !== null && x.name !== '');

    if (newItems.length === 0) {
      toast.error('Не удалось распознать строки');
      return;
    }

    bulkCreateMutation.mutate(newItems);
  }, [pasteText, estimateId, sections, bulkCreateMutation]);

  const handleAddItem = useCallback(() => {
    if (!newItemForm.name?.trim()) {
      toast.error('Введите наименование');
      return;
    }
    createItemMutation.mutate({
      estimate: estimateId,
      section: newItemForm.section || sections[0]?.id || 0,
      name: newItemForm.name,
      model_name: newItemForm.model_name,
      unit: newItemForm.unit || 'шт',
      quantity: newItemForm.quantity || '1',
      material_unit_price: newItemForm.material_unit_price || '0',
      work_unit_price: newItemForm.work_unit_price || '0',
    });
  }, [newItemForm, estimateId, sections, createItemMutation]);

  const sectionMap = useMemo(() => {
    const map: Record<number, string> = {};
    sections.forEach((s) => (map[s.id] = s.name));
    return map;
  }, [sections]);

  const columns = useMemo<ColumnDef<EstimateItem, any>[]>(() => {
    const cols: ColumnDef<EstimateItem, any>[] = [];

    if (!readOnly) {
      cols.push(createSelectColumn<EstimateItem>());
    }

    cols.push(
      {
        accessorKey: 'item_number',
        header: '№',
        size: 50,
        enableSorting: true,
      },
      {
        accessorKey: 'name',
        header: 'Наименование',
        size: 250,
        meta: readOnly ? undefined : { editable: true, type: 'text' as const },
      },
      {
        accessorKey: 'model_name',
        header: 'Модель',
        size: 150,
        meta: readOnly ? undefined : { editable: true, type: 'text' as const },
      },
      {
        accessorKey: 'unit',
        header: 'Ед.',
        size: 60,
        meta: readOnly ? undefined : { editable: true, type: 'text' as const },
      },
      {
        accessorKey: 'quantity',
        header: 'Кол-во',
        size: 80,
        meta: readOnly ? undefined : { editable: true, type: 'number' as const },
        cell: ({ getValue }) => {
          const v = getValue();
          return typeof v === 'string' ? parseFloat(v).toLocaleString('ru-RU') : v;
        },
      },
      {
        accessorKey: 'material_unit_price',
        header: 'Цена мат.',
        size: 100,
        meta: readOnly ? undefined : { editable: true, type: 'number' as const },
        cell: ({ getValue }) => formatCurrency(getValue() as string),
      },
      {
        accessorKey: 'work_unit_price',
        header: 'Цена раб.',
        size: 100,
        meta: readOnly ? undefined : { editable: true, type: 'number' as const },
        cell: ({ getValue }) => formatCurrency(getValue() as string),
      },
      {
        accessorKey: 'material_total',
        header: 'Итого мат.',
        size: 110,
        enableSorting: true,
        cell: ({ getValue }) => formatCurrency(getValue() as string),
      },
      {
        accessorKey: 'work_total',
        header: 'Итого раб.',
        size: 110,
        cell: ({ getValue }) => formatCurrency(getValue() as string),
      },
      {
        accessorKey: 'line_total',
        header: 'Итого',
        size: 120,
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="font-medium">{formatCurrency(getValue() as string)}</span>
        ),
      },
      {
        accessorKey: 'section',
        header: 'Раздел',
        size: 140,
        cell: ({ getValue }) => sectionMap[getValue() as number] || '—',
      },
    );

    if (!readOnly) {
      cols.push({
        id: 'actions',
        header: '',
        size: 40,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => deleteItemMutation.mutate(row.original.id)}
            aria-label="Удалить строку"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        ),
      });
    }

    return cols;
  }, [readOnly, sectionMap, deleteItemMutation]);

  const totals = useMemo(() => {
    let materials = 0;
    let works = 0;
    let total = 0;
    items.forEach((item) => {
      materials += parseFloat(item.material_total) || 0;
      works += parseFloat(item.work_total) || 0;
      total += parseFloat(item.line_total) || 0;
    });
    return { materials, works, total };
  }, [items]);

  const selectedCount = Object.values(rowSelection).filter(Boolean).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Строка
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPasteDialogOpen(true)}>
            <ClipboardPaste className="h-4 w-4 mr-1" />
            Вставить из Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Импорт файла
          </Button>
          {items.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setAutoMatchOpen(true)}>
              <Wand2 className="h-4 w-4 mr-1" />
              Подобрать цены
            </Button>
          )}
          {selectedCount > 0 && (
            <Button size="sm" variant="destructive" onClick={handleDeleteSelected}>
              <Trash2 className="h-4 w-4 mr-1" />
              Удалить ({selectedCount})
            </Button>
          )}
          <div className="ml-auto flex items-center gap-3">
            <Badge variant="secondary">{items.length} строк</Badge>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={items}
        enableSorting
        enableFiltering
        enableRowSelection={!readOnly}
        enableVirtualization={items.length > 200}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        onRowSelectionChange={setRowSelection}
        onCellEdit={handleCellEdit}
        getRowId={(row) => String(row.id)}
        rowClassName={(row) =>
          row.original.is_analog ? 'bg-amber-50' : undefined
        }
        estimatedRowHeight={40}
        footerContent={
          <div className="flex items-center gap-6 py-2 font-medium">
            <span>Итого материалы: {formatCurrency(totals.materials)}</span>
            <span>Итого работы: {formatCurrency(totals.works)}</span>
            <span className="text-lg">Всего: {formatCurrency(totals.total)}</span>
          </div>
        }
        emptyMessage="Нет строк сметы. Добавьте строки вручную или импортируйте из Excel/PDF."
      />

      {/* Add Item Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить строку сметы</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Раздел</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={newItemForm.section || ''}
                onChange={(e) =>
                  setNewItemForm((f) => ({ ...f, section: Number(e.target.value) }))
                }
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Наименование *</Label>
              <Input
                value={newItemForm.name || ''}
                onChange={(e) => setNewItemForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Кабель ВВГнг 3x1.5"
              />
            </div>
            <div>
              <Label>Модель</Label>
              <Input
                value={newItemForm.model_name || ''}
                onChange={(e) => setNewItemForm((f) => ({ ...f, model_name: e.target.value }))}
                placeholder="NYM 3x1.5"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Ед. изм.</Label>
                <Input
                  value={newItemForm.unit || 'шт'}
                  onChange={(e) => setNewItemForm((f) => ({ ...f, unit: e.target.value }))}
                />
              </div>
              <div>
                <Label>Кол-во</Label>
                <Input
                  type="number"
                  value={newItemForm.quantity || '1'}
                  onChange={(e) => setNewItemForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div>
                <Label>Цена мат.</Label>
                <Input
                  type="number"
                  value={newItemForm.material_unit_price || '0'}
                  onChange={(e) =>
                    setNewItemForm((f) => ({ ...f, material_unit_price: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>Цена работы</Label>
              <Input
                type="number"
                value={newItemForm.work_unit_price || '0'}
                onChange={(e) =>
                  setNewItemForm((f) => ({ ...f, work_unit_price: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleAddItem} disabled={createItemMutation.isPending}>
              {createItemMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AutoMatch Dialog */}
      <AutoMatchDialog
        open={isAutoMatchOpen}
        onOpenChange={setAutoMatchOpen}
        estimateId={estimateId}
      />

      {/* Import from file Dialog */}
      <EstimateImportDialog
        open={isImportDialogOpen}
        onOpenChange={setImportDialogOpen}
        estimateId={estimateId}
      />

      {/* Paste from Excel Dialog */}
      <Dialog open={isPasteDialogOpen} onOpenChange={setPasteDialogOpen}>
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
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            {pasteText.trim() && (
              <p className="text-sm text-muted-foreground">
                Распознано строк: {pasteText.trim().split('\n').filter((l) => l.split('\t').length >= 2 && l.split('\t')[0]?.trim()).length}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handlePasteFromExcel} disabled={bulkCreateMutation.isPending}>
              {bulkCreateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Импортировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
