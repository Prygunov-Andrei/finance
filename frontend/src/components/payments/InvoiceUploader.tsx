import { useState, useRef } from 'react';
import { api, ParseInvoiceResponse } from '../../lib/api';
import { Upload, FileText, Loader2, AlertCircle, CheckCircle, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';

interface InvoiceUploaderProps {
  onParsed: (data: ParseInvoiceResponse) => void;
  onError: (error: string) => void;
  onFileSelected?: (file: File) => void;
  disabled?: boolean;
  enableParsing?: boolean; // Опционально включаем парсинг
}

type UploadState = 'idle' | 'uploading' | 'parsing' | 'success' | 'error';

export function InvoiceUploader({ onParsed, onError, onFileSelected, disabled = false, enableParsing = true }: InvoiceUploaderProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    // Сначала сохраняем файл в форме
    if (onFileSelected) {
      onFileSelected(file);
    }

    // Валидация PDF
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      const error = 'Допускается только формат PDF';
      setErrorMessage(error);
      setState('error');
      onError(error);
      return;
    }

    setFileName(file.name);
    setState('uploading');
    setErrorMessage('');
    setWarnings([]);

    try {
      if (enableParsing) {
        setState('parsing');
        const result = await api.parseInvoice(file);

        if (result.success) {
          setState('success');
          setWarnings(result.warnings || []);
          onParsed(result);
        } else {
          setState('error');
          const error = result.error || 'Ошибка парсинга счёта';
          setErrorMessage(error);
          onError(error);
        }
      } else {
        // Для income просто успешно загружаем без парсинга
        setState('success');
        // Не вызываем onParsed, так как парсинга не было
      }
    } catch (error: any) {
      setState('error');
      let errorMsg = 'Ошибка при обработке файла';

      // Обработка специфичных ошибок
      if (error.message?.includes('CORS') || error.message?.includes('ERR_FAILED')) {
        errorMsg = 'Ошибка подключения к серверу. Проверьте настройки CORS или доступность API.';
      } else if (error.message?.includes('429')) {
        errorMsg = 'Превышен лимит запросов. Попробуйте через несколько минут.';
      } else if (error.message?.includes('400')) {
        errorMsg = 'Ошибка обработки файла. Проверьте, что файл не повреждён.';
      } else if (error.message?.includes('500') || error.message?.includes('503')) {
        errorMsg = 'Сервер временно недоступен. Попробуйте позже.';
      } else if (error.message) {
        errorMsg = error.message;
      }

      setErrorMessage(errorMsg);
      onError(errorMsg);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleReset = () => {
    setState('idle');
    setErrorMessage('');
    setWarnings([]);
    setFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      {/* Drag & Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && state === 'idle' && fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-all duration-200
          ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-400 hover:bg-blue-50'}
          ${state === 'success' ? 'border-green-500 bg-green-50' : ''}
          ${state === 'error' ? 'border-red-500 bg-red-50' : ''}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />

        {/* Idle State */}
        {state === 'idle' && (
          <div className="space-y-3">
            <Upload className="w-12 h-12 mx-auto text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">
                Перетащите PDF-счёт сюда или нажмите для выбора
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {enableParsing ? 'PDF файл с автоматическим извлечением данных' : 'PDF файл документа'}
              </p>
            </div>
          </div>
        )}

        {/* Uploading State */}
        {state === 'uploading' && (
          <div className="space-y-3">
            <Loader2 className="w-12 h-12 mx-auto text-blue-500 animate-spin" />
            <div>
              <p className="text-sm font-medium text-gray-700">Загрузка файла...</p>
              <p className="text-xs text-gray-500 mt-1">{fileName}</p>
            </div>
          </div>
        )}

        {/* Parsing State */}
        {state === 'parsing' && (
          <div className="space-y-3">
            <Loader2 className="w-12 h-12 mx-auto text-blue-500 animate-spin" />
            <div>
              <p className="text-sm font-medium text-blue-600">Анализируем счёт...</p>
              <p className="text-xs text-gray-500 mt-1">
                Извлекаем данные о контрагенте, суммах и товарах
              </p>
            </div>
          </div>
        )}

        {/* Success State */}
        {state === 'success' && (
          <div className="space-y-3">
            <CheckCircle className="w-12 h-12 mx-auto text-green-500" />
            <div>
              <p className="text-sm font-medium text-green-700">
                {enableParsing ? 'Счёт успешно обработан!' : 'Документ успешно загружен!'}
              </p>
              <p className="text-xs text-gray-500 mt-1">{fileName}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleReset();
              }}
            >
              <X className="w-4 h-4 mr-1" />
              Загрузить другой файл
            </Button>
          </div>
        )}

        {/* Error State */}
        {state === 'error' && (
          <div className="space-y-3">
            <AlertCircle className="w-12 h-12 mx-auto text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-700">Ошибка обработки файла</p>
              <p className="text-xs text-gray-500 mt-1">{fileName}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleReset();
              }}
            >
              <X className="w-4 h-4 mr-1" />
              Попробовать снова
            </Button>
          </div>
        )}
      </div>

      {/* Error Message */}
      {state === 'error' && errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Warnings */}
      {state === 'success' && warnings.length > 0 && (
        <Alert className="border-yellow-500 bg-yellow-50">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <div className="font-medium mb-1">⚠️ Обратите внимание:</div>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}