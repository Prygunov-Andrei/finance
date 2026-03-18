import { useState, useRef, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  Upload,
  X,
  FileText,
  FileSpreadsheet,
  Image,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';

const SUPPORTED_EXTENSIONS = ['.pdf', '.xlsx', '.xls', '.png', '.jpg', '.jpeg'];

const MAX_FILES = 50;

interface BulkSession {
  id: number;
  status: string;
  total_files: number;
  processed_files: number;
  successful: number;
  failed: number;
  skipped_duplicate: number;
  errors: string[];
  invoices: Array<{
    id: number;
    status: string;
    invoice_number: string | null;
    invoice_file: string | null;
  }>;
}

interface BulkInvoiceUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId?: number;
}

const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return <FileText className="h-4 w-4 text-red-500" />;
  if (ext === 'xlsx' || ext === 'xls') return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
  return <Image className="h-4 w-4 text-blue-500" />;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const BulkInvoiceUpload = ({ open, onOpenChange, estimateId }: BulkInvoiceUploadProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'select' | 'processing' | 'done'>('select');
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionData, setSessionData] = useState<BulkSession | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = useCallback(() => {
    setStep('select');
    setFiles([]);
    setDragActive(false);
    setSessionId(null);
    setSessionData(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  // Filter supported files
  const filterFiles = useCallback((fileList: FileList | File[]): File[] => {
    const arr = Array.from(fileList);
    return arr.filter((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return SUPPORTED_EXTENSIONS.includes(ext);
    });
  }, []);

  const addFiles = useCallback(
    (newFiles: File[]) => {
      setFiles((prev) => {
        const existing = new Set(prev.map((f) => f.name + f.size));
        const unique = newFiles.filter((f) => !existing.has(f.name + f.size));
        const combined = [...prev, ...unique];
        if (combined.length > MAX_FILES) {
          toast.warning(`Максимум ${MAX_FILES} файлов. Лишние файлы отброшены.`);
          return combined.slice(0, MAX_FILES);
        }
        return combined;
      });
    },
    [],
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Drag and drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) {
      addFiles(filterFiles(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      addFiles(filterFiles(e.target.files));
    }
    e.target.value = '';
  };

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (filesToUpload: File[]) => {
      const formData = new FormData();
      filesToUpload.forEach((f) => formData.append('files', f));
      if (estimateId) formData.append('estimate_id', String(estimateId));
      return (api as any).bulkUploadInvoices(formData);
    },
    onSuccess: (data: { session_id: number }) => {
      setSessionId(data.session_id);
      // step already set to 'processing' in handleStartUpload
    },
    onError: (error: any) => {
      setStep('select');  // Revert to file selection on error
      toast.error('Ошибка загрузки', {
        description: error?.message || 'Попробуйте ещё раз',
      });
    },
  });

  // Poll session status
  useEffect(() => {
    if (step !== 'processing' || !sessionId) return;

    const poll = async () => {
      try {
        const data: BulkSession = await (api as any).getBulkSessionStatus(sessionId);
        setSessionData(data);

        if (data.status === 'completed' || data.status === 'completed_with_errors') {
          setStep('done');
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch {
        // Ignore poll errors
      }
    };

    poll(); // Initial fetch
    pollRef.current = setInterval(poll, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [step, sessionId, queryClient]);

  const handleStartUpload = () => {
    if (files.length === 0) return;
    setStep('processing');  // Show progress immediately
    uploadMutation.mutate(files);
  };

  const progressPercent = sessionData && sessionData.total_files > 0
    ? Math.round((sessionData.processed_files / sessionData.total_files) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'select' && 'Массовый импорт счетов'}
            {step === 'processing' && 'Обработка файлов...'}
            {step === 'done' && 'Импорт завершён'}
          </DialogTitle>
          <DialogDescription>
            {step === 'select' && 'Выберите файлы со счетами (PDF, Excel, изображения)'}
            {step === 'processing' && 'Файлы обрабатываются через ИИ. Это может занять некоторое время.'}
            {step === 'done' && 'Все файлы обработаны. Проверьте результаты.'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: File selection */}
        {step === 'select' && (
          <div className="space-y-4 pt-2">
            {/* Drop zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <Upload className="h-8 w-8 mx-auto mb-3 text-gray-400" />
              <p className="text-sm text-gray-600 mb-3">
                Перетащите файлы сюда или нажмите кнопку ниже
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText className="h-4 w-4 mr-2" />
                Выбрать файлы
              </Button>
              <p className="text-xs text-gray-400 mt-3">
                Поддерживаемые форматы: PDF, XLSX, XLS, PNG, JPG
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept={SUPPORTED_EXTENSIONS.join(',')}
                onChange={handleFileSelect}
              />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">
                    Файлов выбрано: {files.length}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFiles([])}
                    className="text-gray-500 h-7"
                  >
                    Очистить
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                  {files.map((file, i) => (
                    <div
                      key={`${file.name}-${file.size}-${i}`}
                      className="flex items-center gap-3 px-3 py-2 text-sm"
                    >
                      {getFileIcon(file.name)}
                      <span className="flex-1 truncate text-gray-700">{file.name}</span>
                      <span className="text-gray-400 text-xs shrink-0">
                        {formatFileSize(file.size)}
                      </span>
                      <button
                        onClick={() => removeFile(i)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        aria-label={`Удалить ${file.name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Отмена
              </Button>
              <Button
                onClick={handleStartUpload}
                disabled={files.length === 0 || uploadMutation.isPending}
              >
                {uploadMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Начать обработку ({files.length})
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Processing */}
        {step === 'processing' && (
          <div className="space-y-4 pt-2">
            {/* Phase indicator */}
            <div className="flex items-center gap-2 text-sm">
              {!sessionId ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500 flex-shrink-0" />
                  <span className="text-gray-600">
                    Загрузка {files.length} {files.length === 1 ? 'файла' : 'файлов'} на сервер...
                  </span>
                </>
              ) : !sessionData || sessionData.processed_files === 0 ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-purple-500 flex-shrink-0" />
                  <span className="text-gray-600">
                    Файлы получены — ожидание ИИ-распознавания...
                  </span>
                </>
              ) : (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500 flex-shrink-0" />
                  <span className="text-gray-600">
                    Распознавание: {sessionData.processed_files} / {sessionData.total_files} файлов
                  </span>
                </>
              )}
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">
                  {!sessionId
                    ? 'Загрузка...'
                    : !sessionData || sessionData.processed_files === 0
                    ? 'В очереди'
                    : `Обработано ${sessionData.processed_files} из ${sessionData.total_files}`}
                </span>
                <span className="text-xs font-medium text-gray-700">{progressPercent}%</span>
              </div>
              <Progress value={sessionId ? progressPercent : undefined} className={!sessionId ? 'animate-pulse' : ''} />
            </div>

            {/* Stats (show only when we have data) */}
            {sessionData && (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-lg font-bold text-green-700">{sessionData.successful}</p>
                  <p className="text-xs text-green-600">Распознано</p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-lg font-bold text-red-700">{sessionData.failed}</p>
                  <p className="text-xs text-red-600">Ошибки</p>
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <p className="text-lg font-bold text-yellow-700">{sessionData.skipped_duplicate}</p>
                  <p className="text-xs text-yellow-600">Дубликаты</p>
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400 text-center">
              ИИ-распознавание каждого файла занимает 10–30 секунд
            </p>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 'done' && sessionData && (
          <div className="space-y-4 pt-2">
            {sessionData.status === 'completed' ? (
              <Alert className="border-green-300 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700">
                  Все файлы успешно обработаны!
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-yellow-300 bg-yellow-50">
                <XCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-700">
                  Обработка завершена с ошибками. Проверьте результаты ниже.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-lg font-bold text-green-700">{sessionData.successful}</p>
                <p className="text-xs text-green-600">Успешно</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-lg font-bold text-red-700">{sessionData.failed}</p>
                <p className="text-xs text-red-600">Ошибки</p>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg">
                <p className="text-lg font-bold text-yellow-700">{sessionData.skipped_duplicate}</p>
                <p className="text-xs text-yellow-600">Дубликаты</p>
              </div>
            </div>

            {/* Errors list */}
            {sessionData.errors.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-red-700">Ошибки:</p>
                <div className="max-h-32 overflow-y-auto text-xs text-red-600 bg-red-50 rounded-lg p-3 space-y-1">
                  {sessionData.errors.map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Created invoices */}
            {sessionData.invoices.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Созданные счета:</p>
                <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                  {sessionData.invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                      onClick={() => {
                        handleOpenChange(false);
                        navigate(`/supply/invoices/${inv.id}`);
                      }}
                    >
                      <Badge
                        variant="outline"
                        className={
                          inv.status === 'review'
                            ? 'bg-blue-100 text-blue-800'
                            : inv.status === 'recognition'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-gray-100 text-gray-600'
                        }
                      >
                        {inv.status === 'review'
                          ? 'На проверке'
                          : inv.status === 'recognition'
                            ? 'Распознаётся'
                            : inv.status}
                      </Badge>
                      <span className="flex-1 truncate text-gray-700">
                        {inv.invoice_number || inv.invoice_file?.split('/').pop() || `#${inv.id}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  reset();
                  setStep('select');
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Загрузить ещё
              </Button>
              <Button onClick={() => handleOpenChange(false)}>
                Закрыть
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
