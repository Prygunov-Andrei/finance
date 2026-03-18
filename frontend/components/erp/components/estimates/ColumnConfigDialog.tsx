import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type ColumnDef as ColumnDefAPI,
  type ColumnType,
  type ColumnConfigTemplate,
  DEFAULT_COLUMN_CONFIG,
} from '../../lib/api';
import { validateFormula } from '../../lib/formula-engine';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import {
  Plus, Trash2, ChevronUp, ChevronDown, RotateCcw, Save, Download,
  Eye, EyeOff, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  builtin: 'Встроенный',
  custom_number: 'Число',
  custom_text: 'Текст',
  custom_date: 'Дата',
  custom_select: 'Выбор',
  custom_checkbox: 'Чекбокс',
  formula: 'Формула',
};

const NEW_COLUMN_TYPES: ColumnType[] = [
  'custom_number', 'custom_text', 'custom_date', 'custom_select', 'custom_checkbox', 'formula',
];

function generateKey(label: string, existingKeys: Set<string>): string {
  let base = label
    .toLowerCase()
    .replace(/[^a-zа-я0-9]/gi, '_')
    .replace(/[а-яё]/gi, (ch) => {
      const map: Record<string, string> = {
        а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
        и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
        с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
        ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
      };
      return map[ch.toLowerCase()] || '';
    })
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);

  if (!base || !/^[a-z]/.test(base)) base = 'col_' + base;
  let key = base;
  let i = 2;
  while (existingKeys.has(key)) {
    key = `${base}_${i++}`;
  }
  return key;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: number;
  currentConfig: ColumnDefAPI[];
  onSave: (config: ColumnDefAPI[]) => void;
};

export const ColumnConfigDialog: React.FC<Props> = ({
  open, onOpenChange, estimateId, currentConfig, onSave,
}) => {
  const queryClient = useQueryClient();
  const [columns, setColumns] = useState<ColumnDefAPI[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [isSaveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');

  // Initialize from currentConfig when dialog opens
  useEffect(() => {
    if (open) {
      setColumns(currentConfig.length > 0 ? [...currentConfig.map(c => ({ ...c }))] : [...DEFAULT_COLUMN_CONFIG.map(c => ({ ...c }))]);
      setSelectedIdx(null);
    }
  }, [open, currentConfig]);

  // Templates
  const { data: templates = [] } = useQuery({
    queryKey: ['column-config-templates'],
    queryFn: () => api.getColumnConfigTemplates(),
    enabled: open,
  });

  const saveTemplateMutation = useMutation({
    mutationFn: (data: { name: string; description: string; column_config: ColumnDefAPI[] }) =>
      api.createColumnConfigTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['column-config-templates'] });
      setSaveTemplateOpen(false);
      setTemplateName('');
      setTemplateDesc('');
      toast.success('Шаблон сохранён');
    },
    onError: (e) => toast.error(`Ошибка: ${e instanceof Error ? e.message : 'Неизвестная ошибка'}`),
  });

  const applyTemplateMutation = useMutation({
    mutationFn: (templateId: number) => api.applyColumnConfigTemplate(templateId, estimateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate', String(estimateId)] });
      toast.success('Шаблон применён');
      onOpenChange(false);
    },
    onError: (e) => toast.error(`Ошибка: ${e instanceof Error ? e.message : 'Неизвестная ошибка'}`),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: number) => api.deleteColumnConfigTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['column-config-templates'] });
      toast.success('Шаблон удалён');
    },
  });

  const existingKeys = useMemo(() => new Set(columns.map(c => c.key)), [columns]);

  const selected = selectedIdx !== null ? columns[selectedIdx] : null;

  const formulaErrors = useMemo(() => {
    if (!selected || selected.type !== 'formula' || !selected.formula) return [];
    return validateFormula(selected.formula, existingKeys);
  }, [selected, existingKeys]);

  const handleAdd = useCallback((type: ColumnType) => {
    const label = type === 'formula' ? 'Новая формула' :
      type === 'custom_number' ? 'Число' :
      type === 'custom_text' ? 'Текст' :
      type === 'custom_date' ? 'Дата' :
      type === 'custom_select' ? 'Выбор' :
      type === 'custom_checkbox' ? 'Чекбокс' : 'Столбец';
    const key = generateKey(label, existingKeys);
    const newCol: ColumnDefAPI = {
      key,
      label,
      type,
      builtin_field: null,
      width: 120,
      editable: type !== 'formula',
      visible: true,
      formula: type === 'formula' ? '' : null,
      decimal_places: type === 'custom_number' || type === 'formula' ? 2 : null,
      aggregatable: type === 'custom_number' || type === 'formula',
      options: type === 'custom_select' ? ['Вариант 1', 'Вариант 2'] : null,
    };
    setColumns(prev => [...prev, newCol]);
    setSelectedIdx(columns.length);
  }, [existingKeys, columns.length]);

  const handleRemove = useCallback((idx: number) => {
    if (columns[idx]?.type === 'builtin') {
      toast.error('Встроенный столбец нельзя удалить, только скрыть');
      return;
    }
    setColumns(prev => prev.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  }, [columns]);

  const handleMove = useCallback((idx: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= columns.length) return;
    setColumns(prev => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    setSelectedIdx(target);
  }, [columns.length]);

  const updateSelected = useCallback((updates: Partial<ColumnDefAPI>) => {
    if (selectedIdx === null) return;
    setColumns(prev => prev.map((c, i) => i === selectedIdx ? { ...c, ...updates } : c));
  }, [selectedIdx]);

  const handleSave = useCallback(() => {
    onSave(columns);
    onOpenChange(false);
  }, [columns, onSave, onOpenChange]);

  const handleReset = useCallback(() => {
    setColumns([...DEFAULT_COLUMN_CONFIG.map(c => ({ ...c }))]);
    setSelectedIdx(null);
  }, []);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Настройка столбцов сметы</DialogTitle>
          </DialogHeader>

          <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
            {/* Left: column list */}
            <div className="w-1/2 border rounded-md overflow-y-auto">
              <div className="p-2 border-b bg-muted/50 flex items-center gap-1 flex-wrap">
                {NEW_COLUMN_TYPES.map(t => (
                  <Button key={t} size="sm" variant="ghost" className="text-xs h-7 px-2"
                    onClick={() => handleAdd(t)}>
                    <Plus className="h-3 w-3 mr-1" />
                    {COLUMN_TYPE_LABELS[t]}
                  </Button>
                ))}
              </div>
              <div className="divide-y">
                {columns.map((col, idx) => (
                  <div
                    key={col.key + '-' + idx}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent/50 ${selectedIdx === idx ? 'bg-accent' : ''} ${!col.visible ? 'opacity-50' : ''}`}
                    onClick={() => setSelectedIdx(idx)}
                  >
                    <span className="text-xs text-muted-foreground w-16 shrink-0">
                      {COLUMN_TYPE_LABELS[col.type]}
                    </span>
                    <span className="truncate flex-1 text-sm">{col.label}</span>
                    {!col.visible && <EyeOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <div className="flex gap-0.5 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); handleMove(idx, 'up'); }}
                        className="p-0.5 rounded hover:bg-muted" disabled={idx === 0}>
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleMove(idx, 'down'); }}
                        className="p-0.5 rounded hover:bg-muted" disabled={idx === columns.length - 1}>
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      {col.type !== 'builtin' && (
                        <button onClick={(e) => { e.stopPropagation(); handleRemove(idx); }}
                          className="p-0.5 rounded hover:bg-destructive/10 text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: selected column editor */}
            <div className="w-1/2 border rounded-md p-4 overflow-y-auto">
              {selected ? (
                <div className="space-y-4">
                  <div>
                    <Label>Название</Label>
                    <Input value={selected.label} onChange={(e) => updateSelected({ label: e.target.value })} />
                  </div>
                  <div>
                    <Label>Ключ (key)</Label>
                    <Input value={selected.key} disabled={selected.type === 'builtin'}
                      onChange={(e) => updateSelected({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
                    <p className="text-xs text-muted-foreground mt-1">Используется в формулах и API</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Ширина (px)</Label>
                      <Input type="number" value={selected.width}
                        onChange={(e) => updateSelected({ width: Number(e.target.value) || 80 })} />
                    </div>
                    <div>
                      <Label>Десятичные знаки</Label>
                      <Input type="number" value={selected.decimal_places ?? ''} placeholder="—"
                        onChange={(e) => updateSelected({ decimal_places: e.target.value ? Number(e.target.value) : null })} />
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selected.visible}
                        onChange={(e) => updateSelected({ visible: e.target.checked })} className="h-4 w-4" />
                      Видимый
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selected.editable}
                        disabled={selected.type === 'formula'}
                        onChange={(e) => updateSelected({ editable: e.target.checked })} className="h-4 w-4" />
                      Редактируемый
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selected.aggregatable}
                        onChange={(e) => updateSelected({ aggregatable: e.target.checked })} className="h-4 w-4" />
                      Итоги
                    </label>
                  </div>

                  {/* Formula editor */}
                  {selected.type === 'formula' && (
                    <div>
                      <Label>Формула</Label>
                      <Input value={selected.formula || ''} placeholder="quantity * material_unit_price * 1.2"
                        onChange={(e) => updateSelected({ formula: e.target.value })} />
                      {formulaErrors.length > 0 && (
                        <div className="mt-1 text-xs text-destructive space-y-1">
                          {formulaErrors.map((err, i) => <p key={i}>{err}</p>)}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Доступные переменные: {columns.filter(c => c.type !== 'formula' || c.key !== selected.key).map(c => c.key).join(', ')}
                      </p>
                    </div>
                  )}

                  {/* Options for custom_select */}
                  {selected.type === 'custom_select' && (
                    <div>
                      <Label>Варианты (через запятую)</Label>
                      <Input value={(selected.options || []).join(', ')}
                        onChange={(e) => updateSelected({
                          options: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                        })} />
                    </div>
                  )}

                  <div className="pt-2">
                    <Badge variant="outline">{COLUMN_TYPE_LABELS[selected.type]}</Badge>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  Выберите столбец для настройки
                </div>
              )}
            </div>
          </div>

          {/* Templates section */}
          {templates.length > 0 && (
            <div className="border rounded-md p-3 mt-2">
              <p className="text-xs font-medium text-muted-foreground mb-2">Шаблоны</p>
              <div className="flex gap-2 flex-wrap">
                {templates.map((t: ColumnConfigTemplate) => (
                  <div key={t.id} className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => applyTemplateMutation.mutate(t.id)}
                      disabled={applyTemplateMutation.isPending}>
                      <Download className="h-3 w-3 mr-1" />
                      {t.name}
                    </Button>
                    <button onClick={() => deleteTemplateMutation.mutate(t.id)}
                      className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Сбросить
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSaveTemplateOpen(true)}>
              <Save className="h-4 w-4 mr-1" />
              Сохранить как шаблон
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button onClick={handleSave}>
              Применить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Template sub-dialog */}
      <Dialog open={isSaveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Сохранить шаблон столбцов</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Название</Label>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Смета для электрики" />
            </div>
            <div>
              <Label>Описание</Label>
              <Input value={templateDesc} onChange={(e) => setTemplateDesc(e.target.value)}
                placeholder="С наценкой и датой поставки" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateOpen(false)}>Отмена</Button>
            <Button disabled={!templateName.trim() || saveTemplateMutation.isPending}
              onClick={() => saveTemplateMutation.mutate({
                name: templateName.trim(),
                description: templateDesc.trim(),
                column_config: columns,
              })}>
              {saveTemplateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
