'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import SearchDialog from './SearchDialog';

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
    href: '/rating-split-system',
    // Wave 11: карточки моделей переехали на /konditsioner/{slug} —
    // header должен подсвечивать «Рейтинг» и для них.
    match: (p) =>
      p.startsWith('/rating-split-system') || p.startsWith('/konditsioner'),
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Закрытие drawer'а при смене маршрута (клик по пункту меню).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Закрытие по Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header
      style={{
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
        background: 'hsl(var(--rt-paper))',
      }}
    >
      <div
        className="rt-header-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 72,
          gap: 28,
          maxWidth: 1280,
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
            height: 44,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/rating-logo/hvac-info-light.svg"
            alt="HVAC Info"
            className="rt-logo-light"
            width={176}
            height={44}
            style={{ display: 'block', height: 44, width: 'auto' }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/rating-logo/hvac-info-dark.svg"
            alt="HVAC Info"
            className="rt-logo-dark"
            width={176}
            height={44}
            style={{ display: 'none', height: 44, width: 'auto' }}
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
            gap: 8,
            alignItems: 'center',
          }}
          className="rt-actions-desktop"
        >
          <SearchButton onClick={() => setSearchOpen(true)} />
          <ThemeToggle />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginLeft: 'auto',
          }}
          className="rt-actions-mobile"
        >
          <SearchButton onClick={() => setSearchOpen(true)} />
          <ThemeToggle />
          <BurgerButton open={menuOpen} onClick={() => setMenuOpen((v) => !v)} />
        </div>
      </div>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      {menuOpen && (
        <MobileMenu
          pathname={pathname}
          onClose={() => setMenuOpen(false)}
        />
      )}

      <style>{`
        .rt-header-bar { padding: 0 16px; }
        .rt-nav-burger { display: inline-flex; }
        @media (min-width: 1024px) {
          .rt-header-bar { padding: 0 40px; }
          .rt-nav-desktop { display: flex !important; }
          .rt-actions-desktop { display: flex !important; }
          .rt-actions-mobile { display: none !important; }
          .rt-nav-burger { display: none !important; }
        }
        .dark .rt-logo-light { display: none !important; }
        .dark .rt-logo-dark { display: block !important; }
      `}</style>
    </header>
  );
}

function BurgerButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
      aria-expanded={open}
      aria-controls="rt-mobile-menu"
      data-testid="mobile-nav-toggle"
      className="rt-nav-burger"
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: 'hsl(var(--rt-ink-60))',
      }}
    >
      {open ? (
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 6l12 12M6 18L18 6" />
        </svg>
      ) : (
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      )}
    </button>
  );
}

function MobileMenu({
  pathname,
  onClose,
}: {
  pathname: string;
  onClose: () => void;
}) {
  return (
    <div
      id="rt-mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Главное меню"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'hsl(var(--rt-paper))',
          borderBottom: '1px solid hsl(var(--rt-border-subtle))',
          padding: '12px 16px 18px',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {NAV_ITEMS.map((item) => {
            if ('muted' in item) {
              return (
                <li key={item.label}>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 4px',
                      fontSize: 15,
                      fontWeight: 500,
                      color: 'hsl(var(--rt-ink-25))',
                      borderBottom: '1px solid hsl(var(--rt-border-subtle))',
                    }}
                  >
                    {item.label}
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: 'var(--rt-font-mono)',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        color: 'hsl(var(--rt-ink-40))',
                      }}
                    >
                      скоро
                    </span>
                  </span>
                </li>
              );
            }
            const isActive = item.match(pathname);
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={onClose}
                  style={{
                    display: 'block',
                    padding: '14px 4px',
                    fontSize: 15,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'hsl(var(--rt-accent))' : 'hsl(var(--rt-ink))',
                    textDecoration: 'none',
                    borderBottom: '1px solid hsl(var(--rt-border-subtle))',
                  }}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // До mount не знаем тему (живёт в localStorage) — рендерим placeholder того же
  // размера, что и итоговая иконка, чтобы избежать hydration-mismatch и CLS.
  // Разметка на сервере и до mount на клиенте — идентичная: тот же <button> с тем
  // же aria-label и пустым span 16×16 внутри.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Переключить тему"
        data-testid="theme-toggle-placeholder"
        disabled
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'default',
          color: 'hsl(var(--rt-ink-60))',
        }}
      >
        <span aria-hidden style={{ display: 'inline-block', width: 16, height: 16 }} />
      </button>
    );
  }

  const dark = resolvedTheme === 'dark';
  const onClick = () => setTheme(dark ? 'light' : 'dark');
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      data-testid="theme-toggle"
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

function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Поиск"
      data-testid="search-button"
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
      }}
    >
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx={11} cy={11} r={7} />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    </button>
  );
}
