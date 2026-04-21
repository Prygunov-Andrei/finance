'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback } from 'react';

export type RatingTabId = 'index' | 'silence' | 'custom';

const TABS: Array<{ id: RatingTabId; label: string }> = [
  { id: 'index', label: 'По индексу' },
  { id: 'silence', label: 'Самые тихие' },
  { id: 'custom', label: 'Свой рейтинг' },
];

export function useCurrentTab(): RatingTabId {
  const sp = useSearchParams();
  const raw = sp.get('tab');
  if (raw === 'silence' || raw === 'custom') return raw;
  return 'index';
}

export default function RatingTabs({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const active = useCurrentTab();

  const switchTo = useCallback(
    (id: RatingTabId) => {
      const next = new URLSearchParams(sp.toString());
      if (id === 'index') next.delete('tab');
      else next.set('tab', id);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, sp, router]
  );

  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        gap: compact ? 18 : 22,
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => switchTo(tab.id)}
            style={{
              position: 'relative',
              padding: '10px 0',
              border: 0,
              background: 'transparent',
              color: isActive ? 'hsl(var(--rt-ink))' : 'hsl(var(--rt-ink-60))',
              fontFamily: 'var(--rt-font-sans)',
              fontSize: 12,
              fontWeight: isActive ? 600 : 500,
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {tab.label}
            {isActive && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 2,
                  background: 'hsl(var(--rt-accent))',
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
