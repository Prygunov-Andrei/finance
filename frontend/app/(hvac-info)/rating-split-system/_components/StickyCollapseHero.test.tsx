import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import StickyCollapseHero from './StickyCollapseHero';

type IOCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver,
) => void;

class MockIntersectionObserver {
  static lastInstance: MockIntersectionObserver | null = null;
  cb: IOCallback;
  observed: Element | null = null;
  constructor(cb: IOCallback) {
    this.cb = cb;
    MockIntersectionObserver.lastInstance = this;
  }
  observe(el: Element) {
    this.observed = el;
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  trigger(top: number) {
    const entry = {
      target: this.observed,
      isIntersecting: top >= 0,
      boundingClientRect: { top } as DOMRectReadOnly,
      intersectionRatio: top >= 0 ? 1 : 0,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      time: 0,
    } as IntersectionObserverEntry;
    act(() => {
      this.cb([entry], this as unknown as IntersectionObserver);
    });
  }
}

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe('StickyCollapseHero', () => {
  beforeEach(() => {
    mockMatchMedia(false); // desktop
    MockIntersectionObserver.lastInstance = null;
    (
      window as unknown as { IntersectionObserver: typeof IntersectionObserver }
    ).IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  it('рендерит full + children, collapsed скрыт пока sentinel в viewport', () => {
    render(
      <StickyCollapseHero
        full={<div data-testid="hero-full">FULL</div>}
        collapsed={<div data-testid="hero-collapsed">COLLAPSED</div>}
      >
        <div data-testid="sticky-child">CHILD</div>
      </StickyCollapseHero>,
    );
    const rail = screen.getByTestId('sticky-hero-rail');
    expect(rail.getAttribute('data-collapsed')).toBe('false');
    expect(screen.getByTestId('hero-full')).toBeInTheDocument();
    expect(screen.queryByTestId('hero-collapsed')).toBeNull();
    expect(screen.getByTestId('sticky-child')).toBeInTheDocument();
  });

  it('когда sentinel ушёл за верх viewport — показывает collapsed', () => {
    render(
      <StickyCollapseHero
        full={<div>FULL</div>}
        collapsed={<div data-testid="hero-collapsed">COLLAPSED</div>}
      >
        <div>CHILD</div>
      </StickyCollapseHero>,
    );
    MockIntersectionObserver.lastInstance!.trigger(-10);
    const rail = screen.getByTestId('sticky-hero-rail');
    expect(rail.getAttribute('data-collapsed')).toBe('true');
    expect(screen.getByTestId('hero-collapsed')).toBeInTheDocument();
  });

  it('full-hero остаётся в DOM всегда (нет display:none)', () => {
    render(
      <StickyCollapseHero
        full={<div data-testid="hero-full">FULL</div>}
        collapsed={<div>COLLAPSED</div>}
      />,
    );
    MockIntersectionObserver.lastInstance!.trigger(-500);
    expect(screen.getByTestId('hero-full')).toBeInTheDocument();
    const fullWrap = screen.getByTestId('sticky-hero-full');
    expect(fullWrap.style.display).not.toBe('none');
  });

  it('на mobile (disableCollapseOnMobile=true) остаётся expanded', () => {
    mockMatchMedia(true);
    render(
      <StickyCollapseHero
        full={<div>FULL</div>}
        collapsed={<div data-testid="hero-collapsed">COLLAPSED</div>}
      />,
    );
    const rail = screen.getByTestId('sticky-hero-rail');
    expect(rail.getAttribute('data-collapsed')).toBe('false');
    expect(screen.queryByTestId('hero-collapsed')).toBeNull();
  });
});
