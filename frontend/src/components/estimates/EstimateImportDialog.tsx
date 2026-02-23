import React, { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { api, type EstimateImportPreview } from '../../lib/api';
import { DataTable } from '../ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Upload, FileSpreadsheet, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

type ImportRow = EstimateImportPreview['rows'][number];

type EstimateImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: number;
};

type Step = 'upload' | 'parsing' | 'preview' | 'done';

const previewColumns: ColumnDef<ImportRow, any>[] = [
  { accessorKey: 'item_number', header: '№', size: 50 },
  { accessorKey: 'name', header: 'Наименование', size: 250 },
  { accessorKey: 'model_name', header: 'Модель', size: 150 },
  { accessorKey: 'unit', header: 'Ед.', size: 60 },
  { accessorKey: 'quantity', header: 'Кол-во', size: 80 },
  { accessorKey: 'material_unit_price', header: 'Цена мат.', size: 100 },
  { accessorKey: 'work_unit_price', header: 'Цена раб.', size: 100 },
  { accessorKey: 'section_name', header: 'Раздел', size: 140 },
];

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

  const previewMutation = useMutation({
    mutationFn: (file: File) => api.importEstimateFile(estimateId, file, true),
    onSuccess: (data) => {
      setPreviewData(data as EstimateImportPreview);
      setStep('preview');
    },
    onError: (error) => {
      toast.error(`Ошибка парсинга: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      setStep('upload');
    },
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => api.importEstimateFile(estimateId, file, false),
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
    if (!selectedFile) return;
    importMutation.mutate(selectedFile);
  }, [selectedFile, importMutation]);

  const handleReset = useCallback(() => {
    setStep('upload');
    setSelectedFile(null);
    setPreviewData(null);
  }, []);

  const handleClose = useCallback(() => {
    handleReset();
    onOpenChange(false);
  }, [handleReset, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && 'Импорт сметы из файла'}
            {step === 'parsing' && 'Парсинг файла...'}
            {step === 'preview' && 'Предпросмотр импорта'}
            {step === 'done' && 'Импорт завершён'}
          </DialogTitle>
        </DialogHeader>

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
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant="secondary">
                {previewData.total_rows} строк
              </Badge>
              <Badge variant="secondary">
                {previewData.sections.length} разделов
              </Badge>
              <Badge
                variant={previewData.confidence >= 0.7 ? 'default' : 'destructive'}
              >
                Уверенность: {Math.round((previewData.confidence || 0) * 100)}%
              </Badge>
            </div>

            {previewData.sections.length > 0 && (
              <div className="text-sm text-muted-foreground">
                Разделы: {previewData.sections.join(', ')}
              </div>
            )}

            <DataTable
              columns={previewColumns}
              data={previewData.rows}
              enableSorting
              enableVirtualization={previewData.rows.length > 100}
              emptyMessage="Не удалось распознать строки"
            />
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <p className="text-lg font-medium">Импорт успешно завершён</p>
          </div>
        )}

        <DialogFooter>
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleReset}>
                Выбрать другой файл
              </Button>
              <Button onClick={handleConfirmImport} disabled={importMutation.isPending}>
                {importMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Импортировать {previewData?.total_rows} строк
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
