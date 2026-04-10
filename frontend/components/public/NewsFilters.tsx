'use client';

import { useState } from 'react';

interface NewsFiltersProps {
  onChange: (filters: NewsFilterState) => void;
}

export interface NewsFilterState {
  starRating: number[];
  region: string;
  month: string;
}

const STAR_OPTIONS = [
  { value: 5, label: '★★★★★', desc: 'Интересно' },
  { value: 4, label: '★★★★', desc: 'Ограниченно' },
  { value: 3, label: '★★★', desc: 'Не интересно' },
  { value: 2, label: '★★', desc: 'Не по теме' },
];

export function NewsFilters({ onChange }: NewsFiltersProps) {
  const [starRating, setStarRating] = useState<number[]>([5]);
  const [region, setRegion] = useState('');
  const [month, setMonth] = useState('');
  const [expanded, setExpanded] = useState(false);

  const toggleStar = (star: number) => {
    const next = starRating.includes(star)
      ? starRating.filter(s => s !== star)
      : [...starRating, star];
    // Не позволяем убрать все звёзды
    if (next.length === 0) return;
    setStarRating(next);
    onChange({ starRating: next, region, month });
  };

  const handleRegionChange = (value: string) => {
    setRegion(value);
    onChange({ starRating, region: value, month });
  };

  const handleMonthChange = (value: string) => {
    setMonth(value);
    onChange({ starRating, region, month: value });
  };

  const resetFilters = () => {
    setStarRating([5]);
    setRegion('');
    setMonth('');
    onChange({ starRating: [5], region: '', month: '' });
  };

  const hasActiveFilters = starRating.length !== 1 || starRating[0] !== 5 || region || month;

  return (
    <div className="mb-6 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground">Рейтинг:</span>
          {STAR_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => toggleStar(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                starRating.includes(opt.value)
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background text-muted-foreground border-border hover:bg-accent'
              }`}
              title={opt.desc}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Сбросить
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? 'Свернуть' : 'Ещё фильтры'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Месяц:</label>
            <input
              type="month"
              value={month}
              onChange={e => handleMonthChange(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Регион:</label>
            <input
              type="text"
              value={region}
              onChange={e => handleRegionChange(e.target.value)}
              placeholder="Например: Russia"
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm w-40"
            />
          </div>
        </div>
      )}
    </div>
  );
}
