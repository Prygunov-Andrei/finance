'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type NavItem =
  | { label: string; href: string; match: (path: string) => boolean }
  | { label: string; muted: true };

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Новости',
    href: '/',
    match: (p) => p === '/' || p.startsWith('/news'),
  },
  {
    label: 'Рейтинг',
    href: '/ratings',
    match: (p) => p.startsWith('/ratings'),
  },
  { label: 'ISmeta', muted: true },
  { label: 'Мешок Монтажников', muted: true },
  { label: 'Анализ проектов', muted: true },
  { label: 'Франшиза', muted: true },
  { label: 'Ассоциация', muted: true },
  { label: 'Стандарт монтажа', muted: true },
];

export default function HvacInfoHeader() {
  const pathname = usePathname() ?? '/';
  return (
    <header
      style={{
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
        background: 'hsl(var(--rt-paper))',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 64,
          padding: '0 28px',
          gap: 28,
          maxWidth: 1440,
          margin: '0 auto',
        }}
      >
        <Link
          href="/"
          aria-label="HVAC Info — главная"
          style={{
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            height: 36,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/rating-logo/hvac-info-light.svg"
            alt="HVAC Info"
            className="rt-logo-light"
            width={144}
            height={36}
            style={{ display: 'block', height: 36, width: 'auto' }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/rating-logo/hvac-info-dark.svg"
            alt="HVAC Info"
            className="rt-logo-dark"
            width={144}
            height={36}
            style={{ display: 'none', height: 36, width: 'auto' }}
          />
        </Link>

        <nav
          style={{
            display: 'none',
            gap: 22,
            flex: 1,
            alignItems: 'center',
          }}
          className="rt-nav-desktop"
        >
          {NAV_ITEMS.map((item) => {
            if ('muted' in item) {
              return (
                <span
                  key={item.label}
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'hsl(var(--rt-ink-25))',
                    cursor: 'default',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    letterSpacing: -0.1,
                  }}
                >
                  {item.label}
                </span>
              );
            }
            const isActive = item.match(pathname);
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                style={{
                  position: 'relative',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive
                    ? 'hsl(var(--rt-ink))'
                    : 'hsl(var(--rt-ink-80))',
                  textDecoration: 'none',
                  paddingBottom: 8,
                  marginBottom: -8,
                  letterSpacing: -0.1,
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
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
                      borderRadius: 1,
                    }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div
          style={{
            display: 'none',
            gap: 14,
            alignItems: 'center',
          }}
          className="rt-actions-desktop"
        >
          <ThemeToggle />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            marginLeft: 'auto',
          }}
          className="rt-actions-mobile"
        >
          <ThemeToggle />
        </div>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .rt-nav-desktop { display: flex !important; }
          .rt-actions-desktop { display: flex !important; }
          .rt-actions-mobile { display: none !important; }
        }
        .dark .rt-logo-light { display: none !important; }
        .dark .rt-logo-dark { display: block !important; }
      `}</style>
    </header>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const saved =
      typeof localStorage !== 'undefined' ? localStorage.getItem('hvac-theme') : null;
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const isDark = saved === 'dark' || (!saved && !!prefersDark);
    setDark(isDark);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDark);
    }
    setMounted(true);
  }, []);
  const onClick = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('hvac-theme', next ? 'dark' : 'light');
    } catch {
      /* storage unavailable — ok, persist на следующий tick не важен */
    }
  };
  // До mount рендерим dimmed-иконку чтобы не было flash на SSR
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: 'hsl(var(--rt-ink-60))',
        opacity: mounted ? 1 : 0,
        transition: 'opacity 120ms ease',
      }}
    >
      {dark ? (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx={12} cy={12} r={4} />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
