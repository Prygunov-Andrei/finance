'use client';

import Link from 'next/link';
import { useSearchParams, usePathname } from 'next/navigation';

export type RatingTabId = 'index' | 'silence' | 'custom';

const TABS: Array<{ id: RatingTabId; label: string }> = [
  { id: 'index', label: 'По индексу' },
  { id: 'silence', label: 'Самые тихие' },
  { id: 'custom', label: 'Свой рейтинг' },
];

const RATING_HOME = '/rating-split-system/';
const QUIET_PATH = '/quiet';

function isMainRatingPage(pathname: string): boolean {
  return pathname === '/rating-split-system' || pathname === RATING_HOME;
}

export function useCurrentTab(defaultTab: RatingTabId = 'index'): RatingTabId {
  const sp = useSearchParams();
  const raw = sp.get('tab');
  if (raw === 'silence' || raw === 'custom' || raw === 'index') return raw;
  return defaultTab;
}

function tabHref(
  id: RatingTabId,
  pathname: string,
  sp: URLSearchParams,
): string {
  if (isMainRatingPage(pathname)) {
    const next = new URLSearchParams(sp.toString());
    if (id === 'index') next.delete('tab');
    else next.set('tab', id);
    const qs = next.toString();
    return qs ? `${RATING_HOME}?${qs}` : RATING_HOME;
  }
  if (id === 'index') return RATING_HOME;
  if (id === 'silence') return QUIET_PATH;
  return `${RATING_HOME}?tab=custom`;
}

export default function RatingTabs({
  compact = false,
  defaultTab = 'index',
}: {
  compact?: boolean;
  defaultTab?: RatingTabId;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const active = useCurrentTab(defaultTab);
  const onMain = isMainRatingPage(pathname);

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
        const href = tabHref(tab.id, pathname, sp);
        return (
          <Link
            key={tab.id}
            href={href}
            role="tab"
            aria-selected={isActive}
            scroll={!onMain ? undefined : false}
            replace={onMain}
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
              textDecoration: 'none',
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
          </Link>
        );
      })}
    </div>
  );
}
