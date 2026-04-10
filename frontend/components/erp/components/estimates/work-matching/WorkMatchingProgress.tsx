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

const PHASE_LABELS: Record<string, string> = {
  pass1: 'Фаза 1: быстрый подбор',
  pass2_llm: 'Фаза 2: LLM-подбор',
  pass2_web: 'Фаза 2: Web Search',
  matching: 'Подбор...',
};

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

interface Props {
  data: ProgressData;
  startedAt?: number;
}

export function WorkMatchingProgressView({ data, startedAt }: Props) {
  const pct = data.total_items > 0
    ? Math.round((data.current_item / data.total_items) * 100)
    : 0;

  const elapsed = startedAt ? Date.now() - startedAt : 0;
  const eta = startedAt && data.current_item > 0 && pct < 100
    ? (elapsed / data.current_item) * (data.total_items - data.current_item)
    : 0;

  const phaseLabel = PHASE_LABELS[data.current_tier] || SOURCE_LABELS[data.current_tier] || data.current_tier;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span>
          Обработано: {data.current_item} / {data.total_items}
        </span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <Progress value={pct} className="h-2" />

      {/* Timer + ETA */}
      {startedAt && elapsed > 0 && (
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>{formatDuration(elapsed)} прошло</span>
          {pct >= 5 && eta > 0 && (
            <span>~{formatDuration(eta)} осталось</span>
          )}
        </div>
      )}

      {/* Phase + current item */}
      <div className="space-y-1">
        {phaseLabel && (
          <p className="text-xs text-muted-foreground">
            {phaseLabel}
          </p>
        )}
        {data.current_item_name && (
          <p className="text-xs text-muted-foreground truncate" title={data.current_item_name}>
            Текущая: {data.current_item_name}
          </p>
        )}
      </div>

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
