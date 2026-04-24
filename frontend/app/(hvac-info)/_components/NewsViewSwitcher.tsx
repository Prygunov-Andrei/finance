'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { LayoutGrid, List } from 'lucide-react';

export type NewsViewMode = 'grid' | 'list';

const VIEWS: Array<{ code: NewsViewMode; label: string; Icon: typeof LayoutGrid }> = [
  { code: 'grid', label: 'Плитка', Icon: LayoutGrid },
  { code: 'list', label: 'Список', Icon: List },
];

export default function NewsViewSwitcher() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params?.get('view');
  const active: NewsViewMode = raw === 'list' ? 'list' : 'grid';

  const setView = (code: NewsViewMode) => {
    const next = new URLSearchParams(params?.toString() ?? '');
    if (code === 'grid') next.delete('view');
    else next.set('view', code);
    const qs = next.toString();
    router.replace(qs ? `/?${qs}` : '/', { scroll: false });
  };

  return (
    <div
      role="tablist"
      aria-label="Вид ленты"
      style={{
        display: 'inline-flex',
        gap: 0,
        border: '1px solid hsl(var(--rt-border))',
        borderRadius: 4,
        overflow: 'hidden',
      }}
      className="rt-feed-view-switcher"
    >
      {VIEWS.map(({ code, label, Icon }) => {
        const isActive = code === active;
        return (
          <button
            key={code}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={label}
            data-active={isActive ? 'true' : 'false'}
            onClick={() => setView(code)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: isActive ? 600 : 500,
              border: 'none',
              background: isActive ? 'hsl(var(--rt-accent))' : 'transparent',
              color: isActive ? 'hsl(var(--rt-paper))' : 'hsl(var(--rt-ink-60))',
              cursor: 'pointer',
              fontFamily: 'var(--rt-font-sans)',
            }}
          >
            <Icon size={14} aria-hidden />
            <span className="rt-feed-view-switcher-label">{label}</span>
          </button>
        );
      })}

      <style>{`
        @media (max-width: 640px) {
          .rt-feed-view-switcher-label { display: none; }
        }
      `}</style>
    </div>
  );
}
