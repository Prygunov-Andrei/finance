import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import EditorialAuthorPicker from './EditorialAuthorPicker';

// Мокаем newsService — возвращаем авторов или ошибку в зависимости от теста.
const mockGetAuthors = vi.fn();
vi.mock('../../services/newsService', () => ({
  default: {
    getEditorialAuthors: () => mockGetAuthors(),
  },
}));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  mockGetAuthors.mockReset();
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    NoopResizeObserver as unknown as typeof ResizeObserver;
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

describe('EditorialAuthorPicker', () => {
  it('загружает авторов через newsService при mount', async () => {
    mockGetAuthors.mockResolvedValue([
      { id: 1, name: 'Евгений Лаврентьев', role: 'Редактор', avatar_url: '' },
      { id: 2, name: 'Иван Петров', role: '', avatar_url: '' },
    ]);

    render(<EditorialAuthorPicker value={null} onChange={() => {}} />);
    await waitFor(() => {
      expect(mockGetAuthors).toHaveBeenCalledTimes(1);
    });
  });

  it('отображает выбранного автора по id (value=1 → "Евгений...")', async () => {
    mockGetAuthors.mockResolvedValue([
      { id: 1, name: 'Евгений Лаврентьев', role: 'Редактор', avatar_url: '' },
    ]);

    render(<EditorialAuthorPicker value={1} onChange={() => {}} />);
    await waitFor(() => {
      expect(
        screen.getByText(/Евгений Лаврентьев · Редактор/),
      ).toBeInTheDocument();
    });
  });

  it('если endpoint падает → показывает graceful empty state', async () => {
    mockGetAuthors.mockRejectedValue(new Error('404'));

    render(<EditorialAuthorPicker value={null} onChange={() => {}} />);

    await waitFor(() => {
      expect(
        screen.getByText(/Список авторов недоступен/),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Сохраните без автора/),
    ).toBeInTheDocument();
  });

  it('если endpoint вернул пустой массив → сообщение "добавьте в Django-admin"', async () => {
    mockGetAuthors.mockResolvedValue([]);

    render(<EditorialAuthorPicker value={null} onChange={() => {}} />);

    await waitFor(() => {
      expect(
        screen.getByText(/Список авторов пуст/),
      ).toBeInTheDocument();
    });
  });
});
