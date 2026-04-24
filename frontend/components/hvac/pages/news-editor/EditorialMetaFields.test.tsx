import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditorialMetaFields, { LEDE_SOFT_MAX } from './EditorialMetaFields';
import { NEWS_CATEGORIES } from '@/constants';
import type { HvacNewsCategory } from '@/lib/api/types/hvac';

// Radix Select использует pointer-events capturing + ResizeObserver;
// подставляем минимальные моки.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    NoopResizeObserver as unknown as typeof ResizeObserver;
  // Radix проверяет matchMedia/hasPointerCapture
  if (typeof window !== 'undefined') {
    window.matchMedia =
      window.matchMedia ||
      (vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia);
    // jsdom не имеет этих методов — Radix Select крашится без них
    Element.prototype.hasPointerCapture ||= () => false;
    Element.prototype.scrollIntoView ||= () => {};
  }
});

function renderFields(
  overrides: Partial<React.ComponentProps<typeof EditorialMetaFields>> = {},
) {
  const onCategoryChange = vi.fn();
  const onLedeChange = vi.fn();
  const utils = render(
    <EditorialMetaFields
      category={('other' as HvacNewsCategory)}
      onCategoryChange={onCategoryChange}
      lede=""
      onLedeChange={onLedeChange}
      readingTimeMinutes={null}
      {...overrides}
    />,
  );
  return { ...utils, onCategoryChange, onLedeChange };
}

describe('EditorialMetaFields', () => {
  it('рендерит trigger с выбранной категорией (8 вариантов в enum)', () => {
    renderFields({ category: 'business' });
    // Убеждаемся что label категории отображается в триггере
    expect(screen.getByText('Деловые')).toBeInTheDocument();
    // И что в константе ровно 8 значений
    expect(NEWS_CATEGORIES).toHaveLength(8);
    // И что значения совпадают с backend (синхронизация enum)
    expect(NEWS_CATEGORIES.map((c) => c.value)).toEqual([
      'business',
      'industry',
      'market',
      'regulation',
      'review',
      'guide',
      'brands',
      'other',
    ]);
  });

  it('lede textarea: ввод вызывает onLedeChange', () => {
    const { onLedeChange } = renderFields();
    const textarea = screen.getByLabelText('Лид (подзаголовок)') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Новый подзаголовок' } });
    expect(onLedeChange).toHaveBeenCalledWith('Новый подзаголовок');
  });

  it('lede длина отображается как counter (N/300)', () => {
    renderFields({ lede: 'abcde' });
    expect(screen.getByText(`5/${LEDE_SOFT_MAX}`)).toBeInTheDocument();
  });

  it('lede длина > 300 подсвечивается предупреждением', () => {
    renderFields({ lede: 'x'.repeat(LEDE_SOFT_MAX + 1) });
    expect(
      screen.getByText(/Рекомендуется держать лид до 300 символов/),
    ).toBeInTheDocument();
  });

  it('reading_time readonly: показывает "~N мин чтения" если число пришло', () => {
    renderFields({ readingTimeMinutes: 7 });
    expect(screen.getByTestId('news-reading-time').textContent).toContain('~7 мин');
  });

  it('reading_time: показывает fallback при null', () => {
    renderFields({ readingTimeMinutes: null });
    expect(screen.getByTestId('news-reading-time').textContent).toMatch(
      /вычислено автоматически/,
    );
  });
});
