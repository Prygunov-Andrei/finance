'use client';

import { useEffect, useState } from 'react';

type Anchor = { id: string; label: string; active: boolean };

const ANCHORS: Anchor[] = [
  { id: 'overview', label: 'Обзор', active: true },
  { id: 'criteria', label: 'Оценки по критериям', active: true },
  { id: 'mentions', label: 'Упоминания', active: true },
  { id: 'specs', label: 'Характеристики', active: true },
  { id: 'buy', label: 'Где купить', active: true },
  { id: 'reviews', label: 'Отзывы', active: true },
];

export default function DetailAnchorNav() {
  const [active, setActive] = useState<string>('overview');

  useEffect(() => {
    const activeIds = ANCHORS.filter((a) => a.active).map((a) => a.id);
    const targets = activeIds
      .map((id) => document.querySelector(`[data-anchor="${id}"]`))
      .filter((el): el is Element => el != null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter((e) => e.isIntersecting);
        if (intersecting.length > 0) {
          const top = intersecting.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
          );
          const id = top.target.getAttribute('data-anchor');
          if (id) setActive(id);
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );

    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleClick = (id: string) => () => {
    const el = document.querySelector(`[data-anchor="${id}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActive(id);
    }
  };

  return (
    <nav
      aria-label="Разделы страницы"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        background: 'hsl(var(--rt-paper))',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
      }}
      className="rt-anchor-nav"
    >
      <div
        style={{
          display: 'flex',
          gap: 28,
          padding: '0 40px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
        className="rt-anchor-scroller"
      >
        {ANCHORS.map((a) => {
          const isActive = active === a.id && a.active;
          const disabled = !a.active;
          return (
            <button
              key={a.id}
              type="button"
              onClick={disabled ? undefined : handleClick(a.id)}
              disabled={disabled}
              style={{
                position: 'relative',
                padding: '16px 0',
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                color: disabled
                  ? 'hsl(var(--rt-ink-25))'
                  : isActive
                    ? 'hsl(var(--rt-ink))'
                    : 'hsl(var(--rt-ink-60))',
                background: 'transparent',
                border: 0,
                cursor: disabled ? 'default' : 'pointer',
                userSelect: 'none',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--rt-font-sans)',
              }}
            >
              {a.label}
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

      <style>{`
        @media (max-width: 899px) {
          .rt-anchor-scroller { padding: 0 14px !important; gap: 18px !important; }
        }
      `}</style>
    </nav>
  );
}
