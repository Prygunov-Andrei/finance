import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import NewsViewSwitcher from './NewsViewSwitcher';

const replaceMock = vi.fn();
const searchParamsState: { value: string } = { value: '' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

beforeEach(() => {
  replaceMock.mockReset();
  searchParamsState.value = '';
});

afterEach(() => {
  searchParamsState.value = '';
});

describe('NewsViewSwitcher', () => {
  it('рендерит две кнопки с aria-label «Плитка» и «Список»', () => {
    render(<NewsViewSwitcher />);
    const tablist = screen.getByRole('tablist', { name: 'Вид ленты' });
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Плитка' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Список' })).toBeInTheDocument();
  });

  it('по умолчанию (нет ?view) активна «Плитка»', () => {
    render(<NewsViewSwitcher />);
    expect(screen.getByRole('tab', { name: 'Плитка' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Список' })).toHaveAttribute('aria-selected', 'false');
  });

  it('при ?view=list активна «Список»', () => {
    searchParamsState.value = 'view=list';
    render(<NewsViewSwitcher />);
    expect(screen.getByRole('tab', { name: 'Список' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Плитка' })).toHaveAttribute('aria-selected', 'false');
  });

  it('клик на «Список» вызывает router.replace с ?view=list', () => {
    render(<NewsViewSwitcher />);
    fireEvent.click(screen.getByRole('tab', { name: 'Список' }));
    expect(replaceMock).toHaveBeenCalledWith('/?view=list', { scroll: false });
  });

  it('клик на «Плитка» при активном list — удаляет ?view (default)', () => {
    searchParamsState.value = 'view=list';
    render(<NewsViewSwitcher />);
    fireEvent.click(screen.getByRole('tab', { name: 'Плитка' }));
    expect(replaceMock).toHaveBeenCalledWith('/', { scroll: false });
  });

  it('сохраняет другие query-параметры при переключении', () => {
    searchParamsState.value = 'category=industry';
    render(<NewsViewSwitcher />);
    fireEvent.click(screen.getByRole('tab', { name: 'Список' }));
    const [url] = replaceMock.mock.calls[0];
    expect(url).toMatch(/^\/\?/);
    expect(url).toContain('category=industry');
    expect(url).toContain('view=list');
  });

  it('keyboard: Enter на кнопке переключает вид', () => {
    render(<NewsViewSwitcher />);
    const listTab = screen.getByRole('tab', { name: 'Список' });
    listTab.focus();
    fireEvent.keyDown(listTab, { key: 'Enter' });
    fireEvent.click(listTab);
    expect(replaceMock).toHaveBeenCalledWith('/?view=list', { scroll: false });
  });

  it('некорректное значение ?view (например, ?view=foo) трактуется как grid', () => {
    searchParamsState.value = 'view=foo';
    render(<NewsViewSwitcher />);
    expect(screen.getByRole('tab', { name: 'Плитка' })).toHaveAttribute('aria-selected', 'true');
  });
});
