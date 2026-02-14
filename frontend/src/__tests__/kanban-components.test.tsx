import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { KanbanBoardPage } from '../components/kanban/KanbanBoardPage';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const okJson = (data: any) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
  text: async () => JSON.stringify(data),
});

describe('KanbanBoardPage', () => {
  it('renders columns and cards', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/boards/?key=')) {
        return okJson([{ id: 'b1', key: 'supply', title: 'Supply' }]);
      }
      if (url.includes('/columns/?board_id=b1')) {
        return okJson([
          { id: 'c1', board: 'b1', key: 'new', title: 'Новые', order: 1 },
          { id: 'c2', board: 'b1', key: 'done', title: 'Готово', order: 2 },
        ]);
      }
      if (url.includes('/cards/?board_id=b1')) {
        return okJson([
          {
            id: 'card1',
            board: 'b1',
            column: 'c1',
            type: 'supply_case',
            title: 'Счет #1',
            description: '',
            meta: {},
            due_date: '2000-01-01',
            assignee_user_id: null,
            assignee_username: '',
          },
        ]);
      }
      return okJson([]);
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={qc}>
        <KanbanBoardPage boardKey="supply" pageTitle="Канбан снабжения" cardType="supply_case" />
      </QueryClientProvider>,
    );

    const headers = await screen.findAllByText('Новые');
    expect(headers.length).toBeGreaterThan(0);
    expect(await screen.findByText('Счет #1')).toBeInTheDocument();
    expect(await screen.findByText('Просрочено')).toBeInTheDocument();
  });
});

