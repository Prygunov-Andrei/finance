'use client';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { WorkMatchingProgress as ProgressData } from '@/lib/api/types/estimates';

const SOURCE_LABELS: Record<string, string> = {
  default: 'По умолч.',
  history: 'История',
  pricelist: 'Прайс',
  knowledge: 'База знаний',
  category: 'Категория',
  fuzzy: 'Fuzzy',
  llm: 'LLM',
  web: 'Web',
  unmatched: 'Не найдено',
};

export function WorkMatchingProgressView({ data }: { data: ProgressData }) {
  const pct = data.total_items > 0
    ? Math.round((data.current_item / data.total_items) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span>
          Обработано: {data.current_item} / {data.total_items}
        </span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />

      {data.current_tier && (
        <p className="text-xs text-muted-foreground">
          Текущий уровень: {SOURCE_LABELS[data.current_tier] || data.current_tier}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {Object.entries(data.stats).map(([source, count]) =>
          count > 0 ? (
            <Badge
              key={source}
              variant={source === 'unmatched' ? 'destructive' : 'secondary'}
              className="text-xs"
            >
              {SOURCE_LABELS[source] || source}: {count}
            </Badge>
          ) : null,
        )}
      </div>

      {data.errors.length > 0 && (
        <div className="text-xs text-destructive space-y-1">
          {data.errors.map((e, i) => (
            <p key={i}>{e.error}</p>
          ))}
        </div>
      )}
    </div>
  );
}
