import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import NewsCategoriesPage, { slugify } from './NewsCategoriesPage';

const mockGet = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockRestore = vi.fn();

vi.mock('../services/newsCategoriesService', () => ({
  default: {
    getNewsCategories: () => mockGet(),
    createNewsCategory: (...args: unknown[]) => mockCreate(...args),
    updateNewsCategory: (...args: unknown[]) => mockUpdate(...args),
    deleteNewsCategory: (...args: unknown[]) => mockDelete(...args),
    restoreNewsCategory: (...args: unknown[]) => mockRestore(...args),
    bulkUpdateNewsCategory: vi.fn(),
  },
}));

vi.mock('../hooks/useHvacAuth', () => ({
  useHvacAuth: () => ({ user: { is_staff: true } }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  mockGet.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  mockRestore.mockReset();
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    NoopResizeObserver as unknown as typeof ResizeObserver;
  if (typeof window !== 'undefined') {
    window.matchMedia =
      window.matchMedia ||
      (vi.fn().mockImplementation((q: string) => ({
        matches: false,
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia);
    Element.prototype.hasPointerCapture ||= () => false;
    Element.prototype.scrollIntoView ||= () => {};
  }
});

const SAMPLE = [
  { slug: 'business', name: 'Деловые', order: 10, is_active: true },
  { slug: 'industry', name: 'Индустрия', order: 20, is_active: true },
  { slug: 'old', name: 'Старый', order: 90, is_active: false },
];

describe('slugify', () => {
  it('латиница и цифры — лоукейс с дефисами', () => {
    expect(slugify('Hello World 2025')).toBe('hello-world-2025');
  });
  it('кириллица транслитерируется', () => {
    expect(slugify('Деловые новости')).toBe('delovye-novosti');
  });
  it('лишние дефисы и тире сжимаются', () => {
    expect(slugify('  --foo  --bar--  ')).toBe('foo-bar');
  });
});

describe('NewsCategoriesPage', () => {
  it('рендерит список категорий, sorted по order', async () => {
    mockGet.mockResolvedValue(SAMPLE);
    render(<NewsCategoriesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('category-row-business')).toBeInTheDocument();
    });
    expect(screen.getByTestId('category-row-industry')).toBeInTheDocument();
    expect(screen.getByTestId('category-row-old')).toBeInTheDocument();
    // Inactive — с badge «Отключён»
    expect(screen.getByText('Отключён')).toBeInTheDocument();
  });

  it('inline-create: кнопка → строка с auto-slugify → POST → reload', async () => {
    mockGet.mockResolvedValue(SAMPLE);
    mockCreate.mockResolvedValue({
      slug: 'novyi', name: 'Новый', order: 100, is_active: true,
    });
    render(<NewsCategoriesPage />);
    await waitFor(() => screen.getByTestId('add-category-btn'));

    fireEvent.click(screen.getByTestId('add-category-btn'));
    const nameInput = screen.getByTestId('create-name-input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Новый' } });

    const slugInput = screen.getByTestId('create-slug-input') as HTMLInputElement;
    expect(slugInput.value).toBe('novyi');

    fireEvent.click(screen.getByTestId('create-save-btn'));
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        slug: 'novyi',
        name: 'Новый',
        order: 100, // max(10,20,90) + 10
        is_active: true,
      });
    });
  });

  it('rename: pencil → input → save → PATCH', async () => {
    mockGet.mockResolvedValue(SAMPLE);
    mockUpdate.mockResolvedValue({});
    render(<NewsCategoriesPage />);
    await waitFor(() => screen.getByTestId('rename-btn-business'));

    fireEvent.click(screen.getByTestId('rename-btn-business'));
    const input = screen.getByTestId('rename-input-business') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Бизнес' } });
    fireEvent.click(screen.getByTestId('rename-save-business'));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('business', {
        name: 'Бизнес',
        order: 10,
      });
    });
  });

  it('soft-delete: кнопка → подтверждение → DELETE', async () => {
    mockGet.mockResolvedValue(SAMPLE);
    mockDelete.mockResolvedValue(undefined);
    render(<NewsCategoriesPage />);
    await waitFor(() => screen.getByTestId('delete-btn-business'));

    fireEvent.click(screen.getByTestId('delete-btn-business'));
    // Подтверждение
    fireEvent.click(screen.getByText('Отключить'));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('business');
    });
  });

  it('restore: для inactive — кнопка «Вернуть» → PATCH is_active=true', async () => {
    mockGet.mockResolvedValue(SAMPLE);
    mockRestore.mockResolvedValue({});
    render(<NewsCategoriesPage />);
    await waitFor(() => screen.getByTestId('restore-btn-old'));

    fireEvent.click(screen.getByTestId('restore-btn-old'));
    await waitFor(() => {
      expect(mockRestore).toHaveBeenCalledWith('old');
    });
  });
});
