import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NewsCategoryFilter from './NewsCategoryFilter';
import type { HvacNews } from '@/lib/api/types/hvac';

const mockReplace = vi.fn();
let mockSearch = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

beforeEach(() => {
  mockReplace.mockReset();
  mockSearch = '';
});

const makeNews = (id: number, slug: string, name: string, order: number, is_active = true): HvacNews => ({
  id,
  title: `t-${id}`,
  body: '',
  pub_date: '2026-04-01',
  category: slug as HvacNews['category'],
  category_object: { slug, name, order, is_active },
});

describe('NewsCategoryFilter', () => {
  it('строит уникальные категории из items.category_object', () => {
    const items = [
      makeNews(1, 'business', 'Деловые', 10),
      makeNews(2, 'business', 'Деловые', 10), // дубль
      makeNews(3, 'industry', 'Индустрия', 20),
    ];
    render(<NewsCategoryFilter items={items} />);
    expect(screen.getByTestId('category-chip-all')).toBeInTheDocument();
    expect(screen.getByTestId('category-chip-business')).toBeInTheDocument();
    expect(screen.getByTestId('category-chip-industry')).toBeInTheDocument();
  });

  it('сортирует чипы по order, затем по name', () => {
    const items = [
      makeNews(1, 'guide', 'Гайд', 60),
      makeNews(2, 'business', 'Деловые', 10),
      makeNews(3, 'market', 'Рынок', 30),
    ];
    render(<NewsCategoryFilter items={items} />);
    const buttons = screen.getAllByRole('button');
    // Первый — «Все», далее по order: business(10), market(30), guide(60)
    expect(buttons[0].textContent).toBe('Все');
    expect(buttons[1].textContent).toBe('Деловые');
    expect(buttons[2].textContent).toBe('Рынок');
    expect(buttons[3].textContent).toBe('Гайд');
  });

  it('отбрасывает inactive категории', () => {
    const items = [
      makeNews(1, 'business', 'Деловые', 10, true),
      makeNews(2, 'old', 'Старый', 99, false),
    ];
    render(<NewsCategoryFilter items={items} />);
    expect(screen.getByTestId('category-chip-business')).toBeInTheDocument();
    expect(screen.queryByTestId('category-chip-old')).toBeNull();
  });

  it('fallback на NEWS_CATEGORIES когда items пусты или без category_object', () => {
    render(<NewsCategoryFilter items={[]} />);
    // Хардкод содержит «Все» + 7 категорий (без other)
    expect(screen.getByTestId('category-chip-all')).toBeInTheDocument();
    expect(screen.getByTestId('category-chip-business')).toBeInTheDocument();
    expect(screen.getByTestId('category-chip-guide')).toBeInTheDocument();
  });

  it('активная категория из ?category=… помечена aria-pressed', () => {
    mockSearch = 'category=industry';
    const items = [
      makeNews(1, 'business', 'Деловые', 10),
      makeNews(2, 'industry', 'Индустрия', 20),
    ];
    render(<NewsCategoryFilter items={items} />);
    expect(
      screen.getByTestId('category-chip-industry').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByTestId('category-chip-business').getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('клик по чипу обновляет URL через router.replace', () => {
    const items = [makeNews(1, 'business', 'Деловые', 10)];
    render(<NewsCategoryFilter items={items} />);
    fireEvent.click(screen.getByTestId('category-chip-business'));
    expect(mockReplace).toHaveBeenCalledWith('/?category=business', { scroll: false });
  });

  it('клик по «Все» удаляет category из URL', () => {
    mockSearch = 'category=industry';
    const items = [makeNews(1, 'industry', 'Индустрия', 20)];
    render(<NewsCategoryFilter items={items} />);
    fireEvent.click(screen.getByTestId('category-chip-all'));
    expect(mockReplace).toHaveBeenCalledWith('/', { scroll: false });
  });
});
