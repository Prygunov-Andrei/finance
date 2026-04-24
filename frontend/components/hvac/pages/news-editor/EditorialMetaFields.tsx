'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NEWS_CATEGORIES } from '@/constants';
import type { HvacNewsCategory } from '@/lib/api/types/hvac';

/**
 * Soft-cap длины lede. Интерфейсное предупреждение при превышении,
 * но не блокирующая валидация (backend ограничения нет).
 */
export const LEDE_SOFT_MAX = 300;

export interface EditorialMetaFieldsProps {
  category: HvacNewsCategory;
  onCategoryChange: (value: HvacNewsCategory) => void;
  lede: string;
  onLedeChange: (value: string) => void;
  /**
   * Оценка времени чтения в минутах. `null`/`undefined` — backend ещё не
   * считал (новая запись без save). Readonly — backend auto-calc 200 wpm.
   */
  readingTimeMinutes: number | null | undefined;
}

export default function EditorialMetaFields({
  category,
  onCategoryChange,
  lede,
  onLedeChange,
  readingTimeMinutes,
}: EditorialMetaFieldsProps) {
  const ledeLen = lede.length;
  const ledeOverSoftCap = ledeLen > LEDE_SOFT_MAX;

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="news-category">Категория</Label>
        <Select
          value={category}
          onValueChange={(value: string) =>
            onCategoryChange(value as HvacNewsCategory)
          }
        >
          <SelectTrigger id="news-category" className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NEWS_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground mt-1">
          Показывается как eyebrow-label и chip-filter в ленте.
        </p>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <Label htmlFor="news-lede">Лид (подзаголовок)</Label>
          <span
            className={`text-xs ${
              ledeOverSoftCap
                ? 'text-destructive'
                : 'text-muted-foreground'
            }`}
            aria-live="polite"
          >
            {ledeLen}/{LEDE_SOFT_MAX}
          </span>
        </div>
        <Textarea
          id="news-lede"
          value={lede}
          onChange={(e) => onLedeChange(e.target.value)}
          placeholder="Вводный абзац статьи — выводится крупным шрифтом под заголовком на публичной странице. Если пусто, фронт возьмёт первые 2 абзаца из body."
          rows={3}
          className="mt-1"
        />
        {ledeOverSoftCap && (
          <p className="text-xs text-destructive mt-1">
            Рекомендуется держать лид до {LEDE_SOFT_MAX} символов.
          </p>
        )}
      </div>

      <div>
        <Label>Время чтения</Label>
        <p
          className="text-sm text-muted-foreground mt-1"
          data-testid="news-reading-time"
        >
          {readingTimeMinutes != null
            ? `~${readingTimeMinutes} мин чтения`
            : 'Будет вычислено автоматически после сохранения (200 слов/мин).'}
        </p>
      </div>
    </div>
  );
}
