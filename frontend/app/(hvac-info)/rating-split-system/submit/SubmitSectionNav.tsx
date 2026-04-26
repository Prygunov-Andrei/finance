'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SubmitSectionId = '01' | '02' | '03' | '04' | '05';

export const SUBMIT_SECTIONS: Array<{ id: SubmitSectionId; label: string }> = [
  { id: '01', label: 'Модель' },
  { id: '02', label: 'Характеристики' },
  { id: '03', label: 'Теплообменник внутр.' },
  { id: '04', label: 'Теплообменник наруж.' },
  { id: '05', label: 'Подтверждение' },
];

type Props = {
  completeness: Record<SubmitSectionId, boolean>;
};

export default function SubmitSectionNav({ completeness }: Props) {
  const [active, setActive] = useState<SubmitSectionId>('01');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<SubmitSectionId, HTMLButtonElement | null>>(
    new Map(),
  );
  const isClickScrollingRef = useRef(false);
  const clickScrollTimeoutRef = useRef<number | null>(null);

  // IntersectionObserver: наблюдаем за секциями, подсвечиваем самую верхнюю видимую
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const targets = SUBMIT_SECTIONS.map(
      (s) => document.getElementById(`submit-section-${s.id}`),
    ).filter((el): el is HTMLElement => el != null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isClickScrollingRef.current) return;
        const intersecting = entries.filter((e) => e.isIntersecting);
        if (intersecting.length === 0) return;
        const top = intersecting.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
        );
        const rawId = top.target.id.replace('submit-section-', '');
        if (isSubmitSectionId(rawId)) {
          setActive(rawId);
        }
      },
      // rootMargin: верх ~-120px (чуть больше rail+nav ~102px, чтобы секция
      // на границе после smooth-scroll уверенно детектилась как intersecting);
      // низ -60% — подсвечиваем верхнюю видимую секцию, не «следующую».
      { rootMargin: '-120px 0px -60% 0px', threshold: 0 },
    );

    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // На mobile автоскролл активного бейджа в viewport
  useEffect(() => {
    const btn = btnRefs.current.get(active);
    if (!btn) return;
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    if (typeof btn.scrollIntoView !== 'function') return;
    btn.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [active]);

  const handleClick = useCallback(
    (id: SubmitSectionId) => (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      const el = document.getElementById(`submit-section-${id}`);
      if (!el) return;
      setActive(id);
      // Блокируем IntersectionObserver во время smooth-scroll, чтобы не было flip-flop
      isClickScrollingRef.current = true;
      if (clickScrollTimeoutRef.current != null) {
        window.clearTimeout(clickScrollTimeoutRef.current);
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Чуть дольше дефолтного smooth-scroll (~500ms) — ждём пока анимация
      // полностью осядет и только потом возвращаем контроль IntersectionObserver,
      // чтобы IO не «перехватил» active на следующую секцию из-за overshoot.
      clickScrollTimeoutRef.current = window.setTimeout(() => {
        isClickScrollingRef.current = false;
      }, 1200);
    },
    [],
  );

  return (
    <nav
      aria-label="Разделы заявки"
      className="rt-submit-nav"
      style={{
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
        background: 'hsl(var(--rt-paper))',
      }}
    >
      <div
        ref={scrollerRef}
        className="rt-submit-nav-scroller"
        style={{
          display: 'flex',
          gap: 8,
          padding: '10px 40px',
          maxWidth: 1280,
          margin: '0 auto',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          justifyContent: 'safe center',
        }}
      >
        {SUBMIT_SECTIONS.map((s) => {
          const filled = completeness[s.id];
          const isActive = active === s.id;
          return (
            <a
              key={s.id}
              ref={(node) => {
                btnRefs.current.set(
                  s.id,
                  node as unknown as HTMLButtonElement | null,
                );
              }}
              href={`#submit-section-${s.id}`}
              onClick={handleClick(s.id)}
              data-active={isActive ? 'true' : 'false'}
              data-filled={filled ? 'true' : 'false'}
              data-section={s.id}
              data-testid={`submit-nav-${s.id}`}
              aria-current={isActive ? 'true' : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 3,
                whiteSpace: 'nowrap',
                textDecoration: 'none',
                fontFamily: 'var(--rt-font-sans)',
                border: `1.5px solid ${
                  isActive && !filled
                    ? 'hsl(var(--rt-accent))'
                    : filled
                      ? 'transparent'
                      : 'hsl(var(--rt-border-subtle))'
                }`,
                background: filled ? 'hsl(var(--rt-accent))' : 'transparent',
                color: filled
                  ? 'hsl(var(--rt-paper))'
                  : 'hsl(var(--rt-ink-60))',
                // Для filled+active — ring-offset (визуальный индикатор текущей секции
                // на уже закрашенном бейдже)
                boxShadow:
                  isActive && filled
                    ? '0 0 0 2px hsl(var(--rt-paper)), 0 0 0 3.5px hsl(var(--rt-accent))'
                    : 'none',
                cursor: 'pointer',
                transition:
                  'background-color 160ms ease, color 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
                flexShrink: 0,
              }}
            >
              {filled && (
                <svg
                  aria-hidden
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  style={{ flexShrink: 0 }}
                >
                  <path
                    d="M1.5 5.2 L4 7.6 L8.5 2.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              <span
                style={{
                  fontFamily: 'var(--rt-font-mono)',
                  fontSize: 10,
                  letterSpacing: 1,
                  fontWeight: 600,
                }}
              >
                {s.id}
              </span>
              <span style={{ fontSize: 11 }}>{s.label}</span>
            </a>
          );
        })}
      </div>
      <style>{`
        @media (max-width: 899px) {
          .rt-submit-nav-scroller { padding: 10px 20px !important; }
        }
        .rt-submit-nav-scroller::-webkit-scrollbar { height: 0; }
      `}</style>
    </nav>
  );
}

function isSubmitSectionId(v: string): v is SubmitSectionId {
  return v === '01' || v === '02' || v === '03' || v === '04' || v === '05';
}
