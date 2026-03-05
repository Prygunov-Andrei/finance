import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef, type Row } from '@tanstack/react-table';
import { api, type EstimateImportPreview } from '../../lib/api';
import { DataTable } from '../ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Upload, FileSpreadsheet, FileText, Loader2, CheckCircle, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';

type RawImportRow = EstimateImportPreview['rows'][number];
type ImportRow = RawImportRow & { _index: number };

type EstimateImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: number;
};

type Step = 'upload' | 'parsing' | 'preview' | 'done';

export const EstimateImportDialog: React.FC<EstimateImportDialogProps> = ({
  open,
  onOpenChange,
  estimateId,
}) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<EstimateImportPreview | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sectionFlags, setSectionFlags] = useState<Set<number>>(new Set());

  // Rows with stable index for section tracking
  const indexedRows = useMemo<ImportRow[]>(() => {
    if (!previewData) return [];
    return previewData.rows.map((row, i) => ({ ...row, _index: i }));
  }, [previewData]);

  // Compute section_name for each row based on section flags
  const rowsWithSections = useMemo(() => {
    let currentSection = '';
    return indexedRows.map((row) => {
      if (sectionFlags.has(row._index)) {
        currentSection = row.name;
        return { ...row, section_name: row.name };
      }
      return { ...row, section_name: currentSection };
    });
  }, [indexedRows, sectionFlags]);

  const sectionCount = sectionFlags.size;
  const itemCount = rowsWithSections.length - sectionCount;

  const toggleSection = useCallback((index: number) => {
    setSectionFlags((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const previewColumns = useMemo<ColumnDef<ImportRow, any>[]>(() => [
    {
      id: 'section_toggle',
      header: '',
      size: 36,
      enableResizing: false,
      cell: ({ row }) => (
        <button
          onClick={() => toggleSection(row.original._index)}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            sectionFlags.has(row.original._index)
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          }`}
          title={sectionFlags.has(row.original._index) ? 'Снять раздел' : 'Назначить разделом'}
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
      ),
    },
    { accessorKey: 'item_number', header: '№', size: 50 },
    { accessorKey: 'name', header: 'Наименование', size: 300 },
    { accessorKey: 'model_name', header: 'Модель', size: 150 },
    { accessorKey: 'unit', header: 'Ед.', size: 60 },
    { accessorKey: 'quantity', header: 'Кол-во', size: 80 },
    { accessorKey: 'material_unit_price', header: 'Цена мат.', size: 100 },
    { accessorKey: 'work_unit_price', header: 'Цена раб.', size: 100 },
    { accessorKey: 'section_name', header: 'Раздел', size: 140 },
  ], [toggleSection, sectionFlags]);

  const rowClassName = useCallback((row: Row<ImportRow>) => {
    if (sectionFlags.has(row.original._index)) {
      return 'bg-blue-50 font-semibold';
    }
    return undefined;
  }, [sectionFlags]);

  const previewMutation = useMutation({
    mutationFn: (file: File) => api.importEstimateFile(estimateId, file, true),
    onSuccess: (data) => {
      setPreviewData(data as EstimateImportPreview);
      setSectionFlags(new Set());
      setStep('preview');
    },
    onError: (error) => {
      toast.error(`Ошибка парсинга: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      setStep('upload');
    },
  });

  const importMutation = useMutation({
    mutationFn: (rows: Array<{ name: string; model_name?: string; unit?: string; quantity?: string; material_unit_price?: string; work_unit_price?: string; is_section?: boolean }>) =>
      api.importEstimateRows(estimateId, rows),
    onSuccess: (data) => {
      const count = Array.isArray(data) ? data.length : 0;
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      queryClient.invalidateQueries({ queryKey: ['estimate', String(estimateId)] });
      setStep('done');
      toast.success(`Импортировано ${count} строк`);
    },
    onError: (error) => {
      toast.error(`Ошибка импорта: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const handleFileSelect = useCallback((file: File) => {
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls') && !ext.endsWith('.pdf')) {
      toast.error('Поддерживаются только файлы Excel (.xlsx) и PDF');
      return;
    }
    setSelectedFile(file);
    setStep('parsing');
    previewMutation.mutate(file);
  }, [previewMutation]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const handleConfirmImport = useCallback(() => {
    if (!rowsWithSections.length) return;
    const rows = rowsWithSections.map((row) => ({
      name: row.name,
      model_name: row.model_name,
      unit: row.unit,
      quantity: String(row.quantity),
      material_unit_price: String(row.material_unit_price),
      work_unit_price: String(row.work_unit_price),
      is_section: sectionFlags.has(row._index),
    }));
    importMutation.mutate(rows);
  }, [rowsWithSections, sectionFlags, importMutation]);

  const handleReset = useCallback(() => {
    setStep('upload');
    setSelectedFile(null);
    setPreviewData(null);
    setSectionFlags(new Set());
  }, []);

  const handleClose = useCallback(() => {
    handleReset();
    onOpenChange(false);
  }, [handleReset, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-5xl"
        style={{ display: 'flex', flexDirection: 'column', height: '85vh', overflow: 'hidden' }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {step === 'upload' && 'Импорт сметы из файла'}
            {step === 'parsing' && 'Парсинг файла...'}
            {step === 'preview' && 'Предпросмотр импорта'}
            {step === 'done' && 'Импорт завершён'}
          </DialogTitle>
        </DialogHeader>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {step === 'upload' && (
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">
                Перетащите файл сюда или нажмите для выбора
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Поддерживаемые форматы: Excel (.xlsx), PDF
              </p>
              <div className="flex justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel
                </Button>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  PDF
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
            </div>
          )}

          {step === 'parsing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium">
                Распознавание файла {selectedFile?.name}...
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {selectedFile?.name.endsWith('.pdf')
                  ? 'Файл обрабатывается LLM — это может занять до минуты'
                  : 'Парсинг Excel — несколько секунд'}
              </p>
            </div>
          )}

          {step === 'preview' && previewData && (
            <>
              <div className="flex items-center gap-3 shrink-0 mb-3">
                <Badge variant="secondary">
                  {itemCount} строк
                </Badge>
                {sectionCount > 0 && (
                  <Badge className="bg-blue-100 text-blue-800">
                    {sectionCount} разделов
                  </Badge>
                )}
                <Badge
                  variant={previewData.confidence >= 0.7 ? 'default' : 'destructive'}
                >
                  Уверенность: {Math.round((previewData.confidence || 0) * 100)}%
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  Нажмите <FolderOpen className="h-3 w-3 inline" /> чтобы назначить строку разделом
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <DataTable
                  columns={previewColumns}
                  data={rowsWithSections}
                  enableSorting={false}
                  enableVirtualization
                  enableColumnResizing
                  maxHeight="100%"
                  estimatedRowHeight={36}
                  overscan={20}
                  rowClassName={rowClassName}
                  className="h-full [&>*:last-child]:h-full"
                  emptyMessage="Не удалось распознать строки"
                />
              </div>
            </>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
              <p className="text-lg font-medium">Импорт успешно завершён</p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0">
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleReset}>
                Выбрать другой файл
              </Button>
              <Button onClick={handleConfirmImport} disabled={importMutation.isPending}>
                {importMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Импортировать {itemCount} строк
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={handleClose}>Закрыть</Button>
          )}
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>Отмена</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
