'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { HvacNews, HvacNewsCategoryItem } from '@/lib/api/types/hvac';
import { NEWS_CATEGORIES } from './newsHelpers';

interface ChipItem {
  code: string;
  label: string;
}

interface Props {
  /**
   * Список новостей первой страницы. NewsCategoryFilter сам собирает уникальные
   * `category_object` через useMemo и сортирует их по `order` → `name`.
   * Если массив пуст или нет ни одной записи с category_object — используется
   * захардкоженный {@link NEWS_CATEGORIES} как graceful fallback.
   */
  items?: HvacNews[];
}

const ALL_CHIP: ChipItem = { code: 'all', label: 'Все' };

function buildChipsFromItems(items: HvacNews[]): ChipItem[] {
  const seen = new Map<string, HvacNewsCategoryItem>();
  for (const it of items) {
    const co = it.category_object;
    if (co && co.is_active && !seen.has(co.slug)) {
      seen.set(co.slug, co);
    }
  }
  if (seen.size === 0) return [];
  return Array.from(seen.values())
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name, 'ru');
    })
    .map((c) => ({ code: c.slug, label: c.name }));
}

export default function NewsCategoryFilter({ items = [] }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const active = params?.get('category') || 'all';

  const chips: ChipItem[] = useMemo(() => {
    const fromItems = buildChipsFromItems(items);
    if (fromItems.length > 0) return [ALL_CHIP, ...fromItems];
    // Fallback на хардкод (NEWS_CATEGORIES уже содержит «Все» первым).
    return NEWS_CATEGORIES.map((c) => ({ code: c.code, label: c.label }));
  }, [items]);

  const setCategory = (code: string) => {
    const next = new URLSearchParams(params?.toString() ?? '');
    if (code === 'all') next.delete('category');
    else next.set('category', code);
    const qs = next.toString();
    router.replace(qs ? `/?${qs}` : '/', { scroll: false });
  };

  return (
    <nav
      aria-label="Категории"
      style={{
        padding: '14px 40px',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
      }}
      className="rt-feed-chips"
    >
      {chips.map((c) => {
        const isActive = c.code === active;
        return (
          <button
            key={c.code}
            type="button"
            onClick={() => setCategory(c.code)}
            data-testid={`category-chip-${c.code}`}
            aria-pressed={isActive}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: isActive ? 600 : 500,
              borderRadius: 14,
              border: isActive
                ? '1px solid hsl(var(--rt-accent))'
                : '1px solid hsl(var(--rt-border))',
              background: isActive
                ? 'hsl(var(--rt-accent-bg))'
                : 'transparent',
              color: isActive
                ? 'hsl(var(--rt-accent))'
                : 'hsl(var(--rt-ink-60))',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--rt-font-sans)',
            }}
          >
            {c.label}
          </button>
        );
      })}

      <style>{`
        @media (max-width: 1023px) {
          .rt-feed-chips {
            padding: 10px 12px !important;
            flex-wrap: nowrap !important;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
        }
      `}</style>
    </nav>
  );
}
