'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type Props = {
  full: ReactNode;
  collapsed: ReactNode;
  children?: ReactNode;
  /** На mobile hero может занимать слишком много места при свернутом виде —
   *  по умолчанию свернутое состояние отключено на <768px (sticky только для children). */
  disableCollapseOnMobile?: boolean;
};

/**
 * Sticky-wrapper для верхней части страницы рейтинга.
 *
 * Full-hero всегда присутствует в потоке (без display:none), чтобы избежать
 * layout-shift при переключении. Sentinel сразу после full-hero отслеживается
 * IntersectionObserver: когда sentinel уходит за верх viewport (= full-hero
 * полностью прокручен), sticky-rail показывает collapsed-версию + children.
 */
export default function StickyCollapseHero({
  full,
  collapsed,
  children,
  disableCollapseOnMobile = true,
}: Props) {
  const [showCollapsed, setShowCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (disableCollapseOnMobile && isMobile) {
      setShowCollapsed(false);
      return;
    }
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        // sentinel ушёл выше верха viewport → full-hero полностью прокручен
        const above = entry.boundingClientRect.top < 0;
        setShowCollapsed(!entry.isIntersecting && above);
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [disableCollapseOnMobile, isMobile]);

  return (
    <>
      <div data-testid="sticky-hero-full">{full}</div>
      <div
        ref={sentinelRef}
        aria-hidden
        data-testid="sticky-hero-sentinel"
        style={{ height: 1, marginTop: -1 }}
      />
      <div
        data-testid="sticky-hero-rail"
        data-collapsed={showCollapsed ? 'true' : 'false'}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'hsl(var(--rt-paper))',
          boxShadow: showCollapsed
            ? '0 1px 0 hsl(var(--rt-border-subtle))'
            : 'none',
          transition: 'box-shadow 180ms ease',
        }}
      >
        {showCollapsed && collapsed}
        {children}
      </div>
    </>
  );
}
