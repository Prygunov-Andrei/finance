import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef, type Row } from '@tanstack/react-table';
import { api, type EstimateImportPreview } from '../../lib/api';
import { DataTable } from '../ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Upload, FileSpreadsheet, FileText, Loader2, CheckCircle, FolderOpen, XCircle } from 'lucide-react';
import { toast } from 'sonner';

type RawImportRow = EstimateImportPreview['rows'][number];
type ImportRow = RawImportRow & { _index: number };

type EstimateImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: number;
};

type Step = 'upload' | 'parsing' | 'progressive' | 'preview' | 'done';

const POLL_INTERVAL = 3000;

export const EstimateImportDialog: React.FC<EstimateImportDialogProps> = ({
  open,
  onOpenChange,
  estimateId,
}) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [step, setStep] = useState<Step>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<EstimateImportPreview | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sectionFlags, setSectionFlags] = useState<Set<number>>(new Set());

  // PDF progressive state
  const [pdfSessionId, setPdfSessionId] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0 });
  const [pdfErrors, setPdfErrors] = useState<Array<{ page: number; error: string }>>([]);

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

  // ── Excel: синхронный preview (как раньше) ──

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

  // ── Confirm import (общий для Excel и PDF) ──

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

  // ── PDF progressive polling ──

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (step !== 'progressive' || !pdfSessionId) return;

    const poll = async () => {
      try {
        const data = await api.getEstimateImportProgress(pdfSessionId);
        setPdfProgress({ current: data.current_page, total: data.total_pages });
        setPdfErrors(data.errors);

        // Обновляем previewData с новыми строками
        setPreviewData({
          rows: data.rows,
          sections: data.sections,
          total_rows: data.rows.length,
          confidence: 0.8,
        });

        if (data.status === 'completed' || data.status === 'error' || data.status === 'cancelled') {
          stopPolling();
          if (data.status === 'completed') {
            setStep('preview');
          } else if (data.status === 'cancelled') {
            toast.info('Импорт отменён');
            if (data.rows.length > 0) {
              setStep('preview');
            } else {
              setStep('upload');
            }
          } else {
            toast.error('Ошибка при обработке PDF');
            if (data.rows.length > 0) {
              setStep('preview');
            } else {
              setStep('upload');
            }
          }
        }
      } catch {
        // Ошибка сети при поллинге — не критично, повторим
      }
    };

    poll(); // Первый запрос сразу
    pollRef.current = setInterval(poll, POLL_INTERVAL);

    return () => stopPolling();
  }, [step, pdfSessionId, stopPolling]);

  // ── File selection ──

  const handleFileSelect = useCallback((file: File) => {
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls') && !ext.endsWith('.pdf')) {
      toast.error('Поддерживаются только файлы Excel (.xlsx) и PDF');
      return;
    }
    setSelectedFile(file);
    setSectionFlags(new Set());
    setPreviewData(null);
    setPdfErrors([]);

    if (ext.endsWith('.pdf')) {
      // PDF → progressive import через Celery
      setStep('progressive');
      setPdfProgress({ current: 0, total: 0 });
      api.startEstimatePdfImport(estimateId, file)
        .then(({ session_id, total_pages }) => {
          setPdfSessionId(session_id);
          setPdfProgress({ current: 0, total: total_pages });
        })
        .catch((err) => {
          toast.error(`Ошибка запуска импорта: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
          setStep('upload');
        });
    } else {
      // Excel → синхронный preview
      setStep('parsing');
      previewMutation.mutate(file);
    }
  }, [estimateId, previewMutation]);

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
    stopPolling();
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
  }, [rowsWithSections, sectionFlags, importMutation, stopPolling]);

  const handleCancelPdf = useCallback(() => {
    if (pdfSessionId) {
      api.cancelEstimateImport(pdfSessionId).catch(() => {});
    }
    stopPolling();
    if (previewData && previewData.rows.length > 0) {
      setStep('preview');
    } else {
      setStep('upload');
    }
  }, [pdfSessionId, stopPolling, previewData]);

  const handleReset = useCallback(() => {
    stopPolling();
    if (pdfSessionId && step === 'progressive') {
      api.cancelEstimateImport(pdfSessionId).catch(() => {});
    }
    setStep('upload');
    setSelectedFile(null);
    setPreviewData(null);
    setSectionFlags(new Set());
    setPdfSessionId(null);
    setPdfProgress({ current: 0, total: 0 });
    setPdfErrors([]);
  }, [stopPolling, pdfSessionId, step]);

  const handleClose = useCallback(() => {
    handleReset();
    onOpenChange(false);
  }, [handleReset, onOpenChange]);

  const progressPercent = pdfProgress.total > 0
    ? Math.round((pdfProgress.current / pdfProgress.total) * 100)
    : 0;

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
            {step === 'progressive' && `Обработка PDF — страница ${pdfProgress.current} из ${pdfProgress.total}`}
            {step === 'preview' && 'Предпросмотр импорта'}
            {step === 'done' && 'Импорт завершён'}
          </DialogTitle>
        </DialogHeader>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* ── Upload ── */}
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
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Excel
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
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

          {/* ── Parsing (Excel only) ── */}
          {step === 'parsing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium">
                Распознавание файла {selectedFile?.name}...
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Парсинг Excel — несколько секунд
              </p>
            </div>
          )}

          {/* ── Progressive (PDF — строки появляются по мере обработки) ── */}
          {step === 'progressive' && (
            <>
              <div className="shrink-0 mb-3">
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Обработка {selectedFile?.name}
                  </span>
                  <span className="text-muted-foreground">
                    {pdfProgress.current} / {pdfProgress.total} стр. ({progressPercent}%)
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>

              <div className="flex items-center gap-3 shrink-0 mb-3">
                <Badge variant="secondary">{itemCount} строк</Badge>
                {sectionCount > 0 && (
                  <Badge className="bg-blue-100 text-blue-800">{sectionCount} разделов</Badge>
                )}
                {pdfErrors.length > 0 && (
                  <Badge variant="destructive">{pdfErrors.length} ошибок</Badge>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  Можно работать с уже загруженными строками
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
                  emptyMessage="Ожидание первых строк..."
                />
              </div>
            </>
          )}

          {/* ── Preview (после завершения обработки) ── */}
          {step === 'preview' && previewData && (
            <>
              <div className="flex items-center gap-3 shrink-0 mb-3">
                <Badge variant="secondary">{itemCount} строк</Badge>
                {sectionCount > 0 && (
                  <Badge className="bg-blue-100 text-blue-800">{sectionCount} разделов</Badge>
                )}
                {previewData.confidence != null && (
                  <Badge variant={previewData.confidence >= 0.7 ? 'default' : 'destructive'}>
                    Уверенность: {Math.round(previewData.confidence * 100)}%
                  </Badge>
                )}
                {pdfErrors.length > 0 && (
                  <Badge variant="destructive">{pdfErrors.length} стр. с ошибками</Badge>
                )}
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

          {/* ── Done ── */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
              <p className="text-lg font-medium">Импорт успешно завершён</p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0">
          {step === 'progressive' && (
            <>
              <Button variant="outline" onClick={handleCancelPdf}>
                <XCircle className="h-4 w-4 mr-1" />
                Остановить
              </Button>
              <Button onClick={handleConfirmImport} disabled={itemCount === 0 || importMutation.isPending}>
                {importMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Импортировать {itemCount} строк
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleReset}>
                Выбрать другой файл
              </Button>
              <Button onClick={handleConfirmImport} disabled={importMutation.isPending || itemCount === 0}>
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
