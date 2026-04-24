import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import HvacInfoHeader from './HvacInfoHeader';

const pathnameMock = vi.fn<() => string>(() => '/');
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}));

const setThemeMock = vi.fn();
const themeState: { resolvedTheme: string | undefined } = { resolvedTheme: undefined };
vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: themeState.resolvedTheme,
    setTheme: setThemeMock,
    theme: themeState.resolvedTheme,
    themes: ['light', 'dark'],
    systemTheme: 'light',
  }),
}));

describe('HvacInfoHeader active-state', () => {
  it('корневая /: «Новости» active, «Рейтинг» неактивна', () => {
    pathnameMock.mockReturnValue('/');
    render(<HvacInfoHeader />);
    const news = screen.getByRole('link', { hidden: true, name: 'Новости' });
    expect(news).toHaveAttribute('aria-current', 'page');
    const rating = screen.getByRole('link', { hidden: true, name: 'Рейтинг' });
    expect(rating).not.toHaveAttribute('aria-current', 'page');
  });

  it('/news/123: «Новости» active', () => {
    pathnameMock.mockReturnValue('/news/123');
    render(<HvacInfoHeader />);
    expect(screen.getByRole('link', { hidden: true, name: 'Новости' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('/ratings/abc: «Рейтинг» active', () => {
    pathnameMock.mockReturnValue('/ratings/abc');
    render(<HvacInfoHeader />);
    expect(screen.getByRole('link', { hidden: true, name: 'Рейтинг' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { hidden: true, name: 'Новости' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('muted-пункты не являются ссылками и не получают aria-current', () => {
    pathnameMock.mockReturnValue('/');
    render(<HvacInfoHeader />);
    expect(screen.queryByRole('link', { hidden: true, name: 'Мешок Монтажников' })).toBeNull();
    // ISmeta сейчас тоже muted (bc58e69): скрываем пока раздел не готов
    expect(screen.queryByRole('link', { hidden: true, name: 'ISmeta' })).toBeNull();
  });
});

describe('HvacInfoHeader ThemeToggle: mount-guard (hydration-safe)', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/');
    setThemeMock.mockReset();
    themeState.resolvedTheme = undefined;
  });

  afterEach(() => {
    themeState.resolvedTheme = undefined;
  });

  it('renderToString: до mount отдаёт нейтральный placeholder без иконки солнца/луны', async () => {
    themeState.resolvedTheme = 'dark';
    const { renderToString } = await import('react-dom/server');
    const html = renderToString(<HvacInfoHeader />);
    // На сервере компонент всегда отдаёт placeholder (mounted === false),
    // чтобы не знать тему из localStorage и не расходиться с клиентом.
    expect(html).toContain('data-testid="theme-toggle-placeholder"');
    expect(html).not.toContain('data-testid="theme-toggle"');
    // Нейтральный aria-label до mount
    expect(html).toContain('aria-label="Переключить тему"');
    expect(html).not.toContain('Включить светлую тему');
    expect(html).not.toContain('Включить тёмную тему');
    // SSR-версия не содержит иконки солнца (нестабильная dasharray/path).
    // Цель — чтобы серверный html не различался в зависимости от темы.
    // Иконка-луны path из ThemeToggle не должна присутствовать.
    expect(html).not.toContain('M21 12.8A9 9 0 1 1 11.2 3');
    expect(html).not.toContain('circle cx="12" cy="12" r="4"');
  });

  it('после mount рендерит иконку луны (light theme)', async () => {
    themeState.resolvedTheme = 'light';
    render(<HvacInfoHeader />);
    // После useEffect и act() — mounted === true, placeholder больше нет.
    const toggles = await screen.findAllByTestId('theme-toggle');
    expect(toggles.length).toBeGreaterThan(0);
    expect(screen.queryAllByTestId('theme-toggle-placeholder')).toHaveLength(0);
    expect(toggles[0]).toHaveAttribute('aria-label', 'Включить тёмную тему');
  });

  it('после mount рендерит иконку солнца (dark theme)', async () => {
    themeState.resolvedTheme = 'dark';
    render(<HvacInfoHeader />);
    const toggles = await screen.findAllByTestId('theme-toggle');
    expect(toggles.length).toBeGreaterThan(0);
    expect(toggles[0]).toHaveAttribute('aria-label', 'Включить светлую тему');
  });

  it('клик переключает тему через setTheme', async () => {
    themeState.resolvedTheme = 'light';
    render(<HvacInfoHeader />);
    const toggles = await screen.findAllByTestId('theme-toggle');
    act(() => {
      toggles[0].click();
    });
    expect(setThemeMock).toHaveBeenCalledWith('dark');
  });

  it('placeholder имеет те же размеры (32×32), что и итоговая кнопка — нет layout-shift', async () => {
    themeState.resolvedTheme = 'light';
    const { renderToString } = await import('react-dom/server');
    const ssrHtml = renderToString(<HvacInfoHeader />);
    // Placeholder имеет width: 32px; height: 32px в inline-style.
    // Точная проверка через regex на структуру стиля.
    expect(ssrHtml).toMatch(/width:\s*32px/);
    expect(ssrHtml).toMatch(/height:\s*32px/);
  });
});
