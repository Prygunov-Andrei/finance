'use client';

import { useEffect, useState, type ReactNode } from 'react';

type Props = {
  full: ReactNode;
  collapsed: ReactNode;
  children?: ReactNode;
  /** На mobile hero может занимать слишком много места при свернутом виде —
   *  по умолчанию свернутое состояние отключено на <768px (sticky только для children). */
  disableCollapseOnMobile?: boolean;
  /** Порог в пикселях, после которого hero сворачивается. */
  threshold?: number;
};

/**
 * Sticky-wrapper для верхней части страницы рейтинга.
 *
 * При scrollY > threshold full-hero скрывается (display:none — без ремоунта),
 * sticky-блок с collapsed-версией + children прилипает под HvacInfoHeader.
 * При scroll обратно — full-hero восстанавливается, sticky теряет тень.
 */
export default function StickyCollapseHero({
  full,
  collapsed,
  children,
  disableCollapseOnMobile = true,
  threshold = 120,
}: Props) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
      setIsCollapsed(false);
      return;
    }
    const onScroll = () => setIsCollapsed(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [disableCollapseOnMobile, isMobile, threshold]);

  const showCollapsed = isCollapsed && !(disableCollapseOnMobile && isMobile);

  return (
    <>
      <div
        data-testid="sticky-hero-full"
        style={{ display: showCollapsed ? 'none' : 'block' }}
      >
        {full}
      </div>
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
