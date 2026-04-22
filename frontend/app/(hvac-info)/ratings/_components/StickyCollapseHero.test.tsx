import { describe, expect, it, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import StickyCollapseHero from './StickyCollapseHero';

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

function setScroll(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true });
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
}

describe('StickyCollapseHero', () => {
  beforeEach(() => {
    mockMatchMedia(false); // desktop
    setScroll(0);
  });

  it('рендерит full + children при scrollY <= threshold', () => {
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
    const fullWrap = screen.getByTestId('sticky-hero-full');
    expect(fullWrap.style.display).toBe('block');
    expect(screen.queryByTestId('hero-collapsed')).toBeNull();
    expect(screen.getByTestId('sticky-child')).toBeInTheDocument();
  });

  it('при scrollY > threshold схлопывается и рендерит collapsed', () => {
    render(
      <StickyCollapseHero
        full={<div>FULL</div>}
        collapsed={<div data-testid="hero-collapsed">COLLAPSED</div>}
        threshold={100}
      >
        <div>CHILD</div>
      </StickyCollapseHero>,
    );
    setScroll(200);
    const rail = screen.getByTestId('sticky-hero-rail');
    expect(rail.getAttribute('data-collapsed')).toBe('true');
    expect(screen.getByTestId('sticky-hero-full').style.display).toBe('none');
    expect(screen.getByTestId('hero-collapsed')).toBeInTheDocument();
  });

  it('на mobile (disableCollapseOnMobile=true) остаётся expanded даже при скролле', () => {
    mockMatchMedia(true); // mobile
    render(
      <StickyCollapseHero
        full={<div>FULL</div>}
        collapsed={<div data-testid="hero-collapsed">COLLAPSED</div>}
        threshold={100}
      />,
    );
    setScroll(500);
    const rail = screen.getByTestId('sticky-hero-rail');
    expect(rail.getAttribute('data-collapsed')).toBe('false');
    expect(screen.queryByTestId('hero-collapsed')).toBeNull();
  });
});
