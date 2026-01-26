import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { STATE_STYLES, MESSAGES } from '../../constants';
import { Button } from '../ui/button';

interface ErrorDisplayProps {
  /** Сообщение об ошибке */
  message?: string;
  /** Объект ошибки */
  error?: Error | null;
  /** Заголовок */
  title?: string;
  /** Callback для повторной попытки */
  onRetry?: () => void;
  /** Дополнительные классы */
  className?: string;
  /** Компактный режим */
  compact?: boolean;
}

/**
 * Компонент отображения ошибки
 * 
 * @example
 * // Простая ошибка
 * <ErrorDisplay message="Не удалось загрузить данные" />
 * 
 * @example
 * // С повторной попыткой
 * <ErrorDisplay 
 *   error={error} 
 *   onRetry={() => refetch()} 
 * />
 */
export const ErrorDisplay = ({
  message,
  error,
  title = 'Ошибка',
  onRetry,
  className,
  compact = false,
}: ErrorDisplayProps) => {
  const errorMessage = message || error?.message || MESSAGES.LOADING_ERROR;

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2 text-red-600 text-sm', className)}>
        <AlertCircle className="w-4 h-4" />
        <span>{errorMessage}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-blue-600 hover:underline ml-2"
          >
            Повторить
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('p-8', className)}>
      <div className={STATE_STYLES.ERROR}>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium">{title}</h3>
            <p className="mt-1 text-sm opacity-90">{errorMessage}</p>
            {onRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="mt-3 bg-white hover:bg-gray-50"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Повторить попытку
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Компонент "Не найдено"
 */
export const NotFound = ({
  message = MESSAGES.NOT_FOUND,
  className,
}: {
  message?: string;
  className?: string;
}) => (
  <div className={cn('p-8', className)}>
    <div className="bg-yellow-50 text-yellow-700 p-4 rounded-xl flex items-center gap-3">
      <AlertCircle className="w-5 h-5" />
      <span>{message}</span>
    </div>
  </div>
);

export default ErrorDisplay;
