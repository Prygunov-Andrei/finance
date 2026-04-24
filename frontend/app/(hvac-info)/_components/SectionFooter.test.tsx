import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SectionFooter from './SectionFooter';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('SectionFooter', () => {
  it('рендерит 3 колонки с заголовками «О рейтинге» и «Новости»', () => {
    const { container } = render(<SectionFooter />);
    const grid = container.querySelector('.rt-section-footer-grid');
    expect(grid).not.toBeNull();
    const cols = grid!.querySelectorAll('.rt-section-footer-col');
    expect(cols.length).toBe(3);

    expect(within(cols[0] as HTMLElement).getByText('О рейтинге')).toBeInTheDocument();
    expect(within(cols[1] as HTMLElement).getByText('Новости')).toBeInTheDocument();
    // 3-я колонка без Eyebrow — spacer, но никакого текстового заголовка
    expect(within(cols[2] as HTMLElement).queryByText('О рейтинге')).toBeNull();
    expect(within(cols[2] as HTMLElement).queryByText('Новости')).toBeNull();
  });

  it('ссылки колонки «О рейтинге» живые с правильными href', () => {
    render(<SectionFooter />);
    expect(
      screen.getByRole('link', { name: /Как мы считаем/i }),
    ).toHaveAttribute('href', '/ratings/methodology/');
    expect(
      screen.getByRole('link', { name: /Архив моделей/i }),
    ).toHaveAttribute('href', '/ratings/archive/');
    expect(
      screen.getByRole('link', { name: /Добавить модель/i }),
    ).toHaveAttribute('href', '/ratings/submit/');
  });

  it('заглушки «Прислать новость», «Контакты», «Нашли ошибку?» — не-ссылки с cursor:default, title=Скоро и aria-disabled', () => {
    const { container } = render(<SectionFooter />);
    const stubs = container.querySelectorAll('.rt-section-footer-stub');
    expect(stubs.length).toBe(3);
    const labels = Array.from(stubs).map((n) => n.textContent || '');
    expect(labels.some((l) => l.includes('Прислать новость'))).toBe(true);
    expect(labels.some((l) => l.includes('Контакты'))).toBe(true);
    expect(labels.some((l) => l.includes('Нашли ошибку?'))).toBe(true);

    stubs.forEach((el) => {
      expect((el as HTMLElement).tagName).toBe('SPAN');
      expect(el.getAttribute('title')).toBe('Скоро');
      expect(el.getAttribute('aria-disabled')).toBe('true');
      expect((el as HTMLElement).style.cursor).toBe('default');
    });

    // заглушки не зарегистрированы как links
    expect(screen.queryByRole('link', { name: /Прислать новость/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /Контакты/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /Нашли ошибку\?/i })).toBeNull();
  });

  it('кнопка «Вход» — ссылка на /login/', () => {
    render(<SectionFooter />);
    const login = screen.getByRole('link', { name: /Вход/i });
    expect(login).toHaveAttribute('href', '/login/');
  });

  it('ряд входа размещён снизу справа (отдельный контейнер .rt-section-footer-login-row)', () => {
    const { container } = render(<SectionFooter />);
    const loginRow = container.querySelector('.rt-section-footer-login-row');
    expect(loginRow).not.toBeNull();
    // ряд входа идёт ПОСЛЕ grid'а, а не внутри него
    const grid = container.querySelector('.rt-section-footer-grid');
    expect(grid?.contains(loginRow!)).toBe(false);
  });

  it('CSS содержит брейкпоинт 767 с grid-template-columns: 1fr (mobile stack)', () => {
    const { container } = render(<SectionFooter />);
    const styleBlock = container.querySelector('style');
    expect(styleBlock?.textContent || '').toMatch(/max-width:\s*767px/);
    expect(styleBlock?.textContent || '').toMatch(/grid-template-columns:\s*1fr/);
  });
});
