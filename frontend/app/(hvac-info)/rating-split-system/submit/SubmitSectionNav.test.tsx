import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

import SubmitSectionNav, {
  SUBMIT_SECTIONS,
  type SubmitSectionId,
} from './SubmitSectionNav';

type IOCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver,
) => void;

class MockIO {
  static lastInstance: MockIO | null = null;
  cb: IOCallback;
  observed: Set<Element> = new Set();
  constructor(cb: IOCallback) {
    this.cb = cb;
    MockIO.lastInstance = this;
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {}
  takeRecords() {
    return [] as IntersectionObserverEntry[];
  }
  trigger(
    entries: Array<{ targetId: string; top: number; intersecting?: boolean }>,
  ) {
    const mapped: IntersectionObserverEntry[] = [];
    for (const e of entries) {
      const target = document.getElementById(e.targetId);
      if (!target) continue;
      mapped.push({
        target,
        isIntersecting: e.intersecting ?? true,
        boundingClientRect: { top: e.top } as DOMRectReadOnly,
        intersectionRatio: e.intersecting === false ? 0 : 1,
        intersectionRect: {} as DOMRectReadOnly,
        rootBounds: null,
        time: 0,
      } as IntersectionObserverEntry);
    }
    act(() => {
      this.cb(mapped, this as unknown as IntersectionObserver);
    });
  }
}

function mountSectionStubs() {
  // Рендерим в body невидимые «секции» с нужными id, чтобы observer их находил.
  for (const s of SUBMIT_SECTIONS) {
    const div = document.createElement('div');
    div.id = `submit-section-${s.id}`;
    div.scrollIntoView = vi.fn();
    document.body.appendChild(div);
  }
}

function cleanupSections() {
  for (const s of SUBMIT_SECTIONS) {
    const el = document.getElementById(`submit-section-${s.id}`);
    if (el) el.remove();
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

const EMPTY_COMPLETENESS: Record<SubmitSectionId, boolean> = {
  '01': false,
  '02': false,
  '03': false,
  '04': false,
  '05': false,
};

describe('SubmitSectionNav', () => {
  beforeEach(() => {
    cleanupSections();
    MockIO.lastInstance = null;
    (
      window as unknown as { IntersectionObserver: typeof IntersectionObserver }
    ).IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;
    mockMatchMedia(false);
    mountSectionStubs();
  });

  it('рендерит 5 бейджей', () => {
    render(<SubmitSectionNav completeness={EMPTY_COMPLETENESS} />);
    for (const s of SUBMIT_SECTIONS) {
      const el = screen.getByTestId(`submit-nav-${s.id}`);
      expect(el).toBeInTheDocument();
      expect(el.textContent).toContain(s.id);
      expect(el.textContent).toContain(s.label);
    }
  });

  it('пустой completeness → все data-filled=false', () => {
    render(<SubmitSectionNav completeness={EMPTY_COMPLETENESS} />);
    for (const s of SUBMIT_SECTIONS) {
      const el = screen.getByTestId(`submit-nav-${s.id}`);
      expect(el.getAttribute('data-filled')).toBe('false');
    }
  });

  it('заполненная секция → data-filled=true + галочка в SVG', () => {
    render(
      <SubmitSectionNav
        completeness={{ ...EMPTY_COMPLETENESS, '01': true, '03': true }}
      />,
    );
    const s01 = screen.getByTestId('submit-nav-01');
    expect(s01.getAttribute('data-filled')).toBe('true');
    expect(s01.querySelector('svg')).not.toBeNull();
    const s02 = screen.getByTestId('submit-nav-02');
    expect(s02.getAttribute('data-filled')).toBe('false');
    expect(s02.querySelector('svg')).toBeNull();
    const s03 = screen.getByTestId('submit-nav-03');
    expect(s03.getAttribute('data-filled')).toBe('true');
  });

  it('клик по бейджу вызывает scrollIntoView + устанавливает data-active', () => {
    render(<SubmitSectionNav completeness={EMPTY_COMPLETENESS} />);
    const btn = screen.getByTestId('submit-nav-03');
    const target = document.getElementById('submit-section-03')!;
    const scrollSpy = target.scrollIntoView as ReturnType<typeof vi.fn>;

    fireEvent.click(btn);

    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(btn.getAttribute('data-active')).toBe('true');
    // Остальные — не active
    expect(
      screen.getByTestId('submit-nav-01').getAttribute('data-active'),
    ).toBe('false');
  });

  it('IntersectionObserver подсвечивает верхнюю видимую секцию', () => {
    render(<SubmitSectionNav completeness={EMPTY_COMPLETENESS} />);
    const io = MockIO.lastInstance!;
    // Две секции видимые, но 02 выше чем 03.
    io.trigger([
      { targetId: 'submit-section-02', top: 50 },
      { targetId: 'submit-section-03', top: 400 },
    ]);
    expect(
      screen.getByTestId('submit-nav-02').getAttribute('data-active'),
    ).toBe('true');
    expect(
      screen.getByTestId('submit-nav-03').getAttribute('data-active'),
    ).toBe('false');
  });

  it('начальный active — это 01', () => {
    render(<SubmitSectionNav completeness={EMPTY_COMPLETENESS} />);
    expect(
      screen.getByTestId('submit-nav-01').getAttribute('data-active'),
    ).toBe('true');
  });

  it('клик временно блокирует IntersectionObserver (чтобы избежать flip-flop)', () => {
    render(<SubmitSectionNav completeness={EMPTY_COMPLETENESS} />);
    const btn = screen.getByTestId('submit-nav-04');
    fireEvent.click(btn);
    // Во время scroll IO должен игнорировать entries
    const io = MockIO.lastInstance!;
    io.trigger([{ targetId: 'submit-section-01', top: 10 }]);
    // Active остаётся 04 — observer был заблокирован
    expect(
      screen.getByTestId('submit-nav-04').getAttribute('data-active'),
    ).toBe('true');
  });

  it('aria-current="true" у активного бейджа', () => {
    render(<SubmitSectionNav completeness={EMPTY_COMPLETENESS} />);
    const s01 = screen.getByTestId('submit-nav-01');
    expect(s01.getAttribute('aria-current')).toBe('true');
    const s02 = screen.getByTestId('submit-nav-02');
    expect(s02.getAttribute('aria-current')).toBeNull();
  });

  it('на mobile активный бейдж scrollIntoView({inline:nearest}) в горизонтальном скроллере', () => {
    mockMatchMedia(true); // mobile
    const scrollSpy = vi.fn();
    // Mocked на прототипе HTMLElement — будет применяться ко всем элементам
    const orig = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView =
      scrollSpy as unknown as typeof HTMLElement.prototype.scrollIntoView;
    try {
      render(<SubmitSectionNav completeness={EMPTY_COMPLETENESS} />);
      // Initial mount — вызовет scrollIntoView для 01 (initial active)
      // Очистим — нас интересует именно переход на 04
      scrollSpy.mockClear();
      const io = MockIO.lastInstance!;
      io.trigger([{ targetId: 'submit-section-04', top: 50 }]);
      // Проверяем что хотя бы один вызов был с нужными параметрами
      const matched = scrollSpy.mock.calls.some(
        (args) =>
          typeof args[0] === 'object' &&
          args[0] !== null &&
          (args[0] as { inline?: string }).inline === 'nearest' &&
          (args[0] as { block?: string }).block === 'nearest',
      );
      expect(matched).toBe(true);
    } finally {
      HTMLElement.prototype.scrollIntoView = orig;
    }
  });
});
