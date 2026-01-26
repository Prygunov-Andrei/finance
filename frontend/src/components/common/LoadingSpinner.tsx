import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { STATE_STYLES, ICON_SIZES } from '../../constants';

interface LoadingSpinnerProps {
  /** Размер спиннера */
  size?: 'sm' | 'md' | 'lg';
  /** Дополнительные классы */
  className?: string;
  /** Полноэкранный режим с центрированием */
  fullScreen?: boolean;
  /** Текст загрузки */
  text?: string;
}

const SIZE_MAP = {
  sm: ICON_SIZES.SM,
  md: ICON_SIZES.LG,
  lg: ICON_SIZES.XL,
} as const;

/**
 * Компонент спиннера загрузки
 * 
 * @example
 * // Простой спиннер
 * <LoadingSpinner />
 * 
 * @example
 * // Полноэкранный с текстом
 * <LoadingSpinner fullScreen text="Загрузка данных..." />
 */
export const LoadingSpinner = ({
  size = 'md',
  className,
  fullScreen = false,
  text,
}: LoadingSpinnerProps) => {
  const spinnerElement = (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <Loader2 className={cn(SIZE_MAP[size], 'animate-spin text-blue-500')} />
      {text && <p className="text-sm text-gray-500">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className={STATE_STYLES.LOADING}>
        {spinnerElement}
      </div>
    );
  }

  return spinnerElement;
};

/**
 * Обёртка для страницы с загрузкой
 */
export const PageLoading = ({ text = 'Загрузка...' }: { text?: string }) => (
  <LoadingSpinner fullScreen text={text} />
);

export default LoadingSpinner;
