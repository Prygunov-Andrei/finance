import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import React from 'react';

import { MarkdownPage } from '../components/help/MarkdownPage';
import { HelpIndexPage } from '../components/help/HelpIndexPage';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('MarkdownPage', () => {
  it('renders markdown content after fetch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => '# Заголовок\n\nТекст параграфа',
    });

    render(<MarkdownPage filePath="test.md" />);

    expect(await screen.findByText('Заголовок')).toBeTruthy();
    expect(await screen.findByText('Текст параграфа')).toBeTruthy();
  });

  it('shows error on fetch failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    });

    render(<MarkdownPage filePath="nonexistent.md" />);

    expect(await screen.findByText(/Файл не найден/)).toBeTruthy();
  });

  it('generates table of contents for headings', async () => {
    const md = [
      '# Первый',
      '## Второй',
      '## Третий',
      '### Четвертый',
    ].join('\n');

    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => md,
    });

    render(<MarkdownPage filePath="toc.md" />);

    expect(await screen.findByText('Содержание')).toBeTruthy();
    const allFirst = await screen.findAllByText('Первый');
    expect(allFirst.length).toBeGreaterThanOrEqual(1);
  });
});

describe('HelpIndexPage', () => {
  it('renders help sections from index.json', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        title: 'Справка',
        sections: [
          { id: 's1', title: 'Раздел 1', description: 'Описание 1', path: '/help/s1' },
          { id: 's2', title: 'Раздел 2', description: 'Описание 2', path: '/help/s2' },
        ],
      }),
    });

    render(
      <MemoryRouter>
        <HelpIndexPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Справка')).toBeTruthy();
    expect(await screen.findByText('Раздел 1')).toBeTruthy();
    expect(await screen.findByText('Раздел 2')).toBeTruthy();
    expect(await screen.findByText('Описание 1')).toBeTruthy();
  });

  it('shows error on fetch failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    render(
      <MemoryRouter>
        <HelpIndexPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Не удалось загрузить/)).toBeTruthy();
  });
});
