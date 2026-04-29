import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import NewsArticleBody from './NewsArticleBody';

describe('NewsArticleBody', () => {
  it('plain-text: split по пустой строке → два <p>', () => {
    const { container } = render(
      <NewsArticleBody body={'Первый параграф.\n\nВторой параграф.'} />,
    );
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0].textContent).toBe('Первый параграф.');
    expect(paragraphs[1].textContent).toBe('Второй параграф.');
  });

  it('plain-text: строка начинающаяся с "> " рендерится как blockquote', () => {
    const { container } = render(
      <NewsArticleBody body={'Обычный текст.\n\n> Цитата спикера'} />,
    );
    const blockquote = container.querySelector('blockquote');
    expect(blockquote).not.toBeNull();
    // react-markdown оборачивает строку в <p> внутри <blockquote>, поэтому
    // textContent содержит whitespace-обвязку — сравниваем по trim().
    expect(blockquote?.textContent?.trim()).toBe('Цитата спикера');
  });

  it('HTML-body: проходит как-есть через dangerouslySetInnerHTML', () => {
    const { container } = render(
      <NewsArticleBody body={'<p>Hello <strong>world</strong></p>'} />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('world');
  });

  it('пустой body: рендерит пустой wrapper без падения', () => {
    const { container } = render(<NewsArticleBody body="" />);
    expect(container.firstChild).not.toBeNull();
  });
});
