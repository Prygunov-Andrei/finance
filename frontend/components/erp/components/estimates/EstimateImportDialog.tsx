import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef, type Row } from '@tanstack/react-table';
import { api, type EstimateImportPreview } from '@/lib/api';
import { useEstimateApi } from '@/lib/api/estimate-api-context';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Upload, FileSpreadsheet, FileText, Loader2, CheckCircle,
  FolderOpen, XCircle, Minimize2, Maximize2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { type ProjectFileForImport } from './items-editor/types';

type RawImportRow = EstimateImportPreview['rows'][number];
type ImportRow = RawImportRow & { _index: number };

type EstimateImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: number;
  projectFiles?: ProjectFileForImport[];
};

type Step = 'upload' | 'parsing' | 'progressive' | 'preview' | 'done';

const POLL_INTERVAL = 3000;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// ── Звуковое уведомление через Web Audio API ──
function playNotificationBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    // Воспроизводим второй тон для "дин-дон" эффекта
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 600;
    gain2.gain.value = 0.25;
    osc2.start(ctx.currentTime + 0.25);
    osc2.stop(ctx.currentTime + 0.45);
  } catch { /* AudioContext может быть недоступен */ }
}

// F3: надёжное извлечение расширения
function getFileExtension(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop()! : '';
}

export const EstimateImportDialog: React.FC<EstimateImportDialogProps> = ({
  open,
  onOpenChange,
  estimateId,
  projectFiles,
}) => {
  const estimateApi = useEstimateApi();
  const queryClient = useQueryClient();
  const excelInputRef = useRef<HTMLInputElement>(null); // F7: раздельные input
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollFailuresRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null); // F1: AbortController
  const estimateIdRef = useRef(estimateId); // F9: стабильный estimateId
  const previewDataRef = useRef<EstimateImportPreview | null>(null); // F10: ref для polling catch
  const lastRowCountRef = useRef(0); // F8: для оптимизации re-render

  const [step, setStep] = useState<Step>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<EstimateImportPreview | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sectionFlags, setSectionFlags] = useState<Set<number>>(new Set());
  const [isMinimized, setIsMinimized] = useState(false); // Фича: сворачиваемый диалог
  const [selectedProjectFileIds, setSelectedProjectFileIds] = useState<Set<number>>(new Set());

  // PDF progressive state
  const [pdfSessionId, setPdfSessionId] = useState<string | null>(null);
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0 });
  const [pdfErrors, setPdfErrors] = useState<Array<{ page: number; error: string }>>([]);

  // F9: обновляем ref при изменении estimateId
  useEffect(() => { estimateIdRef.current = estimateId; }, [estimateId]);
  // F10: обновляем ref при изменении previewData
  useEffect(() => { previewDataRef.current = previewData; }, [previewData]);

  // ── beforeunload warning ──
  useEffect(() => {
    if (step !== 'progressive' || !pdfSessionId) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [step, pdfSessionId]);

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
              ? 'bg-blue-100 dark:bg-blue-900/30 text-primary'
              : 'bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground'
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
      return 'bg-primary/10 font-semibold';
    }
    return undefined;
  }, [sectionFlags]);

  // ── Excel: синхронный preview ──

  const previewMutation = useMutation({
    mutationFn: (file: File) => estimateApi.importEstimateFilePreview(estimateIdRef.current, file),
    onSuccess: (data) => {
      setPreviewData(data);
      setSectionFlags(new Set());
      setStep('preview');
    },
    onError: (error) => {
      toast.error(`Ошибка парсинга: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      setStep('upload');
    },
  });

  // ── Import from project file (specification) ──

  const specificationFiles = useMemo(() => {
    if (!projectFiles) return [];
    return projectFiles.filter(
      (pf) => pf.file_type_code === 'specification' &&
        /\.(xlsx|xls|pdf)$/i.test(pf.original_filename || pf.file)
    );
  }, [projectFiles]);

  const projectFilePreviewMutation = useMutation({
    mutationFn: (projectFileIds: number[]) =>
      estimateApi.importFromProjectFilePreview(estimateIdRef.current, projectFileIds),
    onSuccess: (data) => {
      setPreviewData(data);
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
      estimateApi.importEstimateRows(estimateIdRef.current, rows),
    onSuccess: (data) => {
      const count = data?.created_count ?? (Array.isArray(data) ? data.length : 0);
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateIdRef.current] });
      queryClient.invalidateQueries({ queryKey: ['estimate', String(estimateIdRef.current)] });
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
    // F1: abort in-flight fetch
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const handleProjectFilesImport = useCallback(() => {
    if (selectedProjectFileIds.size === 0) return;
    stopPolling();
    setSelectedFile(null);
    setSectionFlags(new Set());
    setPreviewData(null);
    setPdfErrors([]);
    setIsMinimized(false);

    // Разделяем выбранные файлы по типу
    const selectedFiles = specificationFiles.filter(pf => selectedProjectFileIds.has(pf.id));
    const pdfIds = selectedFiles
      .filter(pf => /\.pdf$/i.test(pf.original_filename || pf.file))
      .map(pf => pf.id);
    const excelIds = selectedFiles
      .filter(pf => /\.(xlsx|xls)$/i.test(pf.original_filename || pf.file))
      .map(pf => pf.id);

    if (pdfIds.length > 0 && excelIds.length === 0) {
      // Все PDF → async progressive flow
      setStep('progressive');
      setPdfProgress({ current: 0, total: 0 });
      estimateApi.startProjectFilePdfImport(estimateIdRef.current, pdfIds)
        .then(({ session_id, total_pages }) => {
          setPdfSessionId(session_id);
          setPdfProgress({ current: 0, total: total_pages });
        })
        .catch((err) => {
          toast.error(`Ошибка запуска импорта PDF: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
          setStep('upload');
        });
    } else if (excelIds.length > 0 && pdfIds.length === 0) {
      // Все Excel → sync flow
      setStep('parsing');
      projectFilePreviewMutation.mutate(excelIds);
    } else {
      // Смешанный выбор — обрабатываем Excel sync, затем PDF async
      setStep('parsing');
      projectFilePreviewMutation.mutate(excelIds);
      toast.info(`PDF файлы (${pdfIds.length}) будут обработаны отдельно — выберите их после завершения Excel-импорта`);
    }
  }, [selectedProjectFileIds, specificationFiles, projectFilePreviewMutation, stopPolling]);

  useEffect(() => {
    if (step !== 'progressive' || !pdfSessionId) return;

    pollFailuresRef.current = 0;
    lastRowCountRef.current = 0;

    const poll = async () => {
      // F1: создаём AbortController для каждого poll запроса
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const data = await estimateApi.getEstimateImportProgress(pdfSessionId, controller.signal);

        // Проверяем, не был ли запрос отменён
        if (controller.signal.aborted) return;

        pollFailuresRef.current = 0;
        setPdfProgress({ current: data.current_page, total: data.total_pages });
        setPdfErrors(data.errors);

        // F8: обновляем previewData только если данные изменились
        if (data.rows.length !== lastRowCountRef.current || data.status !== 'processing') {
          lastRowCountRef.current = data.rows.length;
          setPreviewData({
            rows: data.rows,
            sections: data.sections,
            total_rows: data.rows.length,
            confidence: 0.8,
          });
        }

        if (data.status === 'completed' || data.status === 'error' || data.status === 'cancelled') {
          stopPolling();

          if (data.status === 'completed') {
            // Фича: авторазворачивание + звук при завершении в свёрнутом виде
            setIsMinimized((wasMinimized) => {
              if (wasMinimized) {
                playNotificationBeep();
                toast.success('Обработка PDF завершена!');
              }
              return false;
            });
            setStep('preview');
          } else if (data.status === 'cancelled') {
            toast.info('Импорт отменён');
            setIsMinimized(false);
            setStep(data.rows.length > 0 ? 'preview' : 'upload');
          } else {
            toast.error('Ошибка при обработке PDF');
            setIsMinimized((wasMinimized) => {
              if (wasMinimized) playNotificationBeep();
              return false;
            });
            setStep(data.rows.length > 0 ? 'preview' : 'upload');
          }
        }
      } catch {
        if (controller.signal.aborted) return; // F1: не считаем abort за ошибку
        pollFailuresRef.current += 1;
        if (pollFailuresRef.current >= 10) {
          stopPolling();
          toast.error('Потеряна связь с сервером при обработке PDF');
          setIsMinimized(false);
          // F10: используем ref вместо state
          const current = previewDataRef.current;
          setStep(current && current.rows.length > 0 ? 'preview' : 'upload');
        }
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);

    return () => stopPolling();
  }, [step, pdfSessionId, stopPolling]);

  // ── File selection ──

  const handleFileSelect = useCallback((file: File) => {
    const ext = getFileExtension(file.name); // F3

    if (!['xlsx', 'xls', 'pdf'].includes(ext)) {
      toast.error('Поддерживаются только файлы Excel (.xlsx) и PDF');
      return;
    }

    // F2: валидация размера файла
    if (file.size === 0) {
      toast.error('Файл пуст');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`Файл слишком большой (макс. ${MAX_FILE_SIZE / (1024 * 1024)} МБ)`);
      return;
    }

    stopPolling();
    setSelectedFile(file);
    setSectionFlags(new Set());
    setPreviewData(null);
    setPdfErrors([]);
    setIsMinimized(false);

    if (ext === 'pdf') {
      setStep('progressive');
      setPdfProgress({ current: 0, total: 0 });
      estimateApi.startEstimatePdfImport(estimateIdRef.current, file)
        .then(({ session_id, total_pages }) => {
          setPdfSessionId(session_id);
          setPdfProgress({ current: 0, total: total_pages });
        })
        .catch((err) => {
          toast.error(`Ошибка запуска импорта: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
          setStep('upload');
        });
    } else {
      setStep('parsing');
      previewMutation.mutate(file);
    }
  }, [previewMutation, stopPolling]);

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
    if (!rowsWithSections.length || importMutation.isPending) return;
    stopPolling();
    // F4: безопасное преобразование — null/undefined → "0"
    const rows = rowsWithSections.map((row) => ({
      name: row.name,
      model_name: row.model_name || '',
      unit: row.unit || 'шт',
      quantity: String(row.quantity ?? 0),
      material_unit_price: String(row.material_unit_price ?? 0),
      work_unit_price: String(row.work_unit_price ?? 0),
      is_section: sectionFlags.has(row._index),
    }));
    importMutation.mutate(rows);
  }, [rowsWithSections, sectionFlags, importMutation, stopPolling]);

  const handleCancelPdf = useCallback(() => {
    if (pdfSessionId) {
      // F5: логируем ошибку cancel (best-effort)
      estimateApi.cancelEstimateImport(pdfSessionId).catch((e) => {
        console.warn('Cancel import failed:', e);
      });
    }
    stopPolling();
    setIsMinimized(false);
    const current = previewDataRef.current;
    setStep(current && current.rows.length > 0 ? 'preview' : 'upload');
  }, [pdfSessionId, stopPolling]);

  const handleReset = useCallback(() => {
    stopPolling();
    if (pdfSessionId && step === 'progressive') {
      estimateApi.cancelEstimateImport(pdfSessionId).catch((e) => {
        console.warn('Cancel import failed:', e);
      });
    }
    setStep('upload');
    setSelectedFile(null);
    setPreviewData(null);
    setSectionFlags(new Set());
    setPdfSessionId(null);
    setPdfProgress({ current: 0, total: 0 });
    setPdfErrors([]);
    setIsMinimized(false);
    setSelectedProjectFileIds(new Set());
  }, [stopPolling, pdfSessionId, step]);

  // Фича: сворачивание
  const handleMinimize = useCallback(() => {
    setIsMinimized(true);
  }, []);

  // Фича: разворачивание
  const handleExpand = useCallback(() => {
    setIsMinimized(false);
  }, []);

  // Фича: отмена из свёрнутого чипа
  const handleCancelFromChip = useCallback(() => {
    handleCancelPdf();
    setIsMinimized(false);
  }, [handleCancelPdf]);

  // F6: handleClose — при progressive сворачивать вместо отмены
  const handleClose = useCallback(() => {
    if (step === 'progressive' && pdfSessionId) {
      handleMinimize();
      return;
    }
    handleReset();
    onOpenChange(false);
  }, [step, pdfSessionId, handleMinimize, handleReset, onOpenChange]);

  const progressPercent = pdfProgress.total > 0
    ? Math.round((pdfProgress.current / pdfProgress.total) * 100)
    : 0;

  // ── Floating chip (minimized view) ──
  const floatingChip = open && isMinimized && typeof document !== 'undefined' ? createPortal(
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-blue-600 text-white rounded-full pl-4 pr-2 py-2.5 shadow-xl cursor-pointer hover:bg-blue-700 transition-colors animate-in slide-in-from-bottom-2 fade-in duration-300"
      onClick={handleExpand}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') handleExpand(); }}
    >
      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate">
          PDF: {pdfProgress.current}/{pdfProgress.total} стр. ({progressPercent}%)
        </span>
        <div className="w-full bg-blue-400/40 rounded-full h-1 mt-1">
          <div
            className="bg-white rounded-full h-1 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleExpand();
        }}
        className="p-1 hover:bg-blue-500 rounded-full transition-colors"
        title="Развернуть"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleCancelFromChip();
        }}
        className="p-1 hover:bg-red-500 rounded-full transition-colors"
        title="Отменить импорт"
      >
        <X className="h-4 w-4" />
      </button>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <Dialog
        open={open && !isMinimized}
        onOpenChange={(newOpen) => {
          // F6: при закрытии во время progressive → сворачивать
          if (!newOpen && step === 'progressive' && pdfSessionId) {
            handleMinimize();
          } else if (!newOpen) {
            handleReset();
            onOpenChange(false);
          }
        }}
      >
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
                {/* F7: раздельные кнопки и input для Excel и PDF */}
                <div className="flex justify-center gap-3">
                  <Button variant="outline" onClick={() => excelInputRef.current?.click()}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Excel
                  </Button>
                  <Button variant="outline" onClick={() => pdfInputRef.current?.click()}>
                    <FileText className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                </div>
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                    e.target.value = '';
                  }}
                />

                {/* Файлы спецификаций из связанных проектов */}
                {specificationFiles.length > 0 && (
                  <div className="mt-6 border-t pt-4">
                    <p className="text-sm font-medium mb-2">Или импортируйте из файлов проекта:</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {specificationFiles.map((pf) => {
                        const isChecked = selectedProjectFileIds.has(pf.id);
                        return (
                          <label
                            key={pf.id}
                            className={`w-full text-left px-3 py-2 rounded-lg border transition-colors text-sm flex items-center gap-2 cursor-pointer ${
                              isChecked ? 'bg-primary/10 border-primary/30' : 'hover:bg-accent'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedProjectFileIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(pf.id)) next.delete(pf.id);
                                  else next.add(pf.id);
                                  return next;
                                });
                              }}
                              className="rounded border-border shrink-0"
                            />
                            {/\.pdf$/i.test(pf.original_filename || pf.file)
                              ? <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                              : <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                            }
                            <span className="truncate">{pf.title || pf.original_filename}</span>
                            <Badge variant="outline" className="text-xs shrink-0 ml-auto">{pf.projectCipher}</Badge>
                          </label>
                        );
                      })}
                    </div>
                    <Button
                      className="mt-2 w-full"
                      disabled={selectedProjectFileIds.size === 0}
                      onClick={handleProjectFilesImport}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Импортировать выбранные ({selectedProjectFileIds.size})
                    </Button>
                  </div>
                )}
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
                  Парсинг файла — несколько секунд
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
                      Обработка {selectedFile?.name || 'PDF файлов проекта'}
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
                    <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400">{sectionCount} разделов</Badge>
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
                    <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400">{sectionCount} разделов</Badge>
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
                <Button variant="outline" onClick={handleMinimize}>
                  <Minimize2 className="h-4 w-4 mr-1" />
                  Свернуть
                </Button>
                <Button variant="outline" onClick={handleCancelPdf}>
                  <XCircle className="h-4 w-4 mr-1" />
                  Остановить
                </Button>
                <Button onClick={handleConfirmImport} disabled={itemCount === 0 || importMutation.isPending}>
                  {importMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Импортировать {itemCount} строк (обработано {pdfProgress.current}/{pdfProgress.total} стр.)
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
              <Button onClick={() => { handleReset(); onOpenChange(false); }}>Закрыть</Button>
            )}
            {step === 'upload' && (
              <Button variant="outline" onClick={() => { handleReset(); onOpenChange(false); }}>Отмена</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating chip — рендерится через portal */}
      {floatingChip}
    </>
  );
};
