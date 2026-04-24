'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import newsService from '../../services/newsService';
import type { RatingModelListItem } from '@/lib/api/types/rating';

export interface MentionedACModelsPickerProps {
  /** Массив выбранных id моделей. Отправляется на backend как `mentioned_ac_models`. */
  value: number[];
  onChange: (modelIds: number[]) => void;
}

/**
 * Отрисовывает label для модели: «Бренд InnerUnit (Series)».
 */
export function formatModelLabel(model: RatingModelListItem): string {
  const parts = [model.brand];
  if (model.inner_unit) parts.push(model.inner_unit);
  const core = parts.filter(Boolean).join(' ');
  return model.series ? `${core} (${model.series})` : core;
}

/**
 * Регистронезависимый поиск по бренду/inner_unit/series.
 * Для query < 2 символов — возвращает все (список небольшой, ~27 моделей).
 */
export function filterACModels(
  models: RatingModelListItem[],
  query: string,
): RatingModelListItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return models;
  return models.filter((m) => {
    const haystack =
      `${m.brand} ${m.inner_unit} ${m.series}`.toLowerCase();
    return haystack.includes(q);
  });
}

export default function MentionedACModelsPicker({
  value,
  onChange,
}: MentionedACModelsPickerProps) {
  const [models, setModels] = useState<RatingModelListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await newsService.getACModelsForSelector();
        if (!cancelled) setModels(list);
      } catch (e) {
        if (!cancelled) {
          console.warn('Не удалось загрузить AC-модели:', e);
          setError('Список моделей недоступен');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => {
    const map = new Map<number, RatingModelListItem>();
    for (const m of models) map.set(m.id, m);
    return map;
  }, [models]);

  const selectedModels = useMemo(
    () =>
      value
        .map((id) => byId.get(id))
        .filter((m): m is RatingModelListItem => Boolean(m)),
    [value, byId],
  );

  const filteredAvailable = useMemo(() => {
    const selected = new Set(value);
    return filterACModels(models, query).filter((m) => !selected.has(m.id));
  }, [models, query, value]);

  const addModel = (id: number) => {
    if (value.includes(id)) return;
    onChange([...value, id]);
    setQuery('');
  };

  const removeModel = (id: number) => {
    onChange(value.filter((v) => v !== id));
  };

  return (
    <div>
      <Label htmlFor="mentioned-ac-models">Упомянутые AC-модели</Label>
      <div className="mt-1 space-y-2">
        {selectedModels.length > 0 && (
          <div
            className="flex flex-wrap gap-1.5"
            data-testid="selected-ac-models"
          >
            {selectedModels.map((m) => (
              <Badge
                key={m.id}
                variant="secondary"
                className="gap-1 pr-1"
              >
                <span>{formatModelLabel(m)}</span>
                <button
                  type="button"
                  onClick={() => removeModel(m.id)}
                  className="rounded-sm hover:bg-muted-foreground/20 p-0.5"
                  aria-label={`Убрать ${formatModelLabel(m)}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div className="relative">
          <Input
            id="mentioned-ac-models"
            value={query}
            placeholder={
              loading
                ? 'Загрузка моделей...'
                : error
                  ? 'Не удалось загрузить модели'
                  : 'Поиск по бренду / inner_unit / серии'
            }
            disabled={loading || Boolean(error)}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => {
              // Задержка, чтобы click по элементу dropdown успел сработать
              window.setTimeout(() => setShowDropdown(false), 150);
            }}
          />
          {showDropdown && filteredAvailable.length > 0 && (
            <div
              className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-popover shadow-md"
              role="listbox"
              data-testid="ac-models-dropdown"
            >
              {filteredAvailable.slice(0, 50).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  onMouseDown={(e) => {
                    // preventDefault чтобы input не потерял focus до handleClick
                    e.preventDefault();
                  }}
                  onClick={() => addModel(m.id)}
                >
                  {formatModelLabel(m)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        AC-модели, упомянутые в новости. Показываются карточкой
        «Упомянутая модель» на публичной странице и в секции «Упоминания
        в прессе» на детальной странице модели.
      </p>
    </div>
  );
}
