import { FileText, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { ICON_SIZES } from '../../constants';

interface EmptyStateProps {
  /** Заголовок */
  title?: string;
  /** Описание */
  description?: string;
  /** Иконка */
  icon?: React.ReactNode;
  /** Текст кнопки действия */
  actionText?: string;
  /** Callback для действия */
  onAction?: () => void;
  /** Дополнительные классы */
  className?: string;
}

/**
 * Компонент пустого состояния
 * 
 * @example
 * // Простое пустое состояние
 * <EmptyState description="Нет данных для отображения" />
 * 
 * @example
 * // С кнопкой создания
 * <EmptyState 
 *   title="Нет договоров"
 *   description="Создайте первый договор"
 *   actionText="Создать договор"
 *   onAction={() => setIsCreateOpen(true)}
 * />
 */
export const EmptyState = ({
  title,
  description = 'Нет данных',
  icon,
  actionText,
  onAction,
  className,
}: EmptyStateProps) => {
  return (
    <div className={cn(
      'bg-white border border-gray-200 rounded-xl p-12 text-center',
      className
    )}>
      <div className="flex flex-col items-center gap-4">
        {icon || (
          <FileText className={cn(ICON_SIZES.XL, 'text-gray-400')} />
        )}
        {title && (
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
        )}
        <p className="text-gray-500">{description}</p>
        {actionText && onAction && (
          <Button onClick={onAction} className="mt-2">
            <Plus className="w-4 h-4 mr-2" />
            {actionText}
          </Button>
        )}
      </div>
    </div>
  );
};

export default EmptyState;
