import React, { useState } from 'react';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { AlertCircle, RefreshCw, Settings } from 'lucide-react';
import { useNavigate } from 'react-router';
import ApiDiagnostics from './ApiDiagnostics';

interface ApiErrorBannerProps {
  error: any;
  onRetry?: () => void;
  showConfigLink?: boolean;
}

export default function ApiErrorBanner({ error, onRetry, showConfigLink = false }: ApiErrorBannerProps) {
  const navigate = useNavigate();
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Определяем тип ошибки
  const isNetworkError = error?.message?.includes('Network Error') || error?.code === 'ERR_NETWORK';
  const isTimeoutError = error?.code === 'ECONNABORTED' || error?.message?.includes('timeout');
  const is500Error = error?.response?.status === 500;
  const is404Error = error?.response?.status === 404;
  const is403Error = error?.response?.status === 403;
  const is401Error = error?.response?.status === 401;

  // Показываем диагностику сразу при критических ошибках подключения
  const shouldShowDiagnostics = isNetworkError || isTimeoutError;

  let title = 'Ошибка подключения к серверу';
  let description = 'Не удалось выполнить запрос к API. Проверьте настройки подключения.';

  if (isNetworkError) {
    title = 'Ошибка сети';
    description = 'Не удалось подключиться к серверу. Проверьте интернет-соединение и URL сервера.';
  } else if (isTimeoutError) {
    title = 'Превышено время ожидания';
    description = 'Сервер не отвечает (таймаут 30 сек). Возможно, Django сервер или ngrok туннель не запущены.';
  } else if (is500Error) {
    title = 'Внутренняя ошибка сервера';
    description = error?.response?.data?.detail || 'Произошла ошибка на сервере. Обратитесь к администратору.';
  } else if (is404Error) {
    title = 'Данные не найдены';
    description = 'Запрашиваемый ресурс не найден на сервере.';
  } else if (is403Error) {
    title = 'Доступ запрещен';
    description = 'У вас нет прав для выполнения этого действия.';
  } else if (is401Error) {
    title = 'Требуется авторизация';
    description = 'Ваша сессия истекла. Пожалуйста, войдите снова.';
  } else if (error?.response?.data?.detail) {
    description = error.response.data.detail;
  }

  // Если критическая ошибка подключения, показываем диагностику
  if (shouldShowDiagnostics && !showDiagnostics) {
    return (
      <div className="space-y-4">
        <ApiDiagnostics error={error} onSuccess={onRetry} />
      </div>
    );
  }

  return (
    <Alert variant="destructive" className="mb-6">
      <AlertCircle className="h-4 w-4" />
      <div className="flex-1">
        <h5 className="font-semibold">{title}</h5>
        <AlertDescription className="mt-1">{description}</AlertDescription>
        
        {/* Дополнительная информация для отладки */}
        {error?.response?.data?.error && (
          <AlertDescription className="mt-2 text-xs opacity-75">
            Детали: {error.response.data.error}
          </AlertDescription>
        )}

        <div className="flex gap-2 mt-3">
          {onRetry && (
            <Button
              onClick={onRetry}
              variant="outline"
              size="sm"
              className="bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <RefreshCw className="w-3 h-3 mr-2" />
              Повторить
            </Button>
          )}
          
          {(showConfigLink || shouldShowDiagnostics) && (
            <Button
              onClick={() => setShowDiagnostics(true)}
              variant="outline"
              size="sm"
              className="bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Settings className="w-3 h-3 mr-2" />
              Диагностика подключения
            </Button>
          )}
        </div>
      </div>
    </Alert>
  );
}