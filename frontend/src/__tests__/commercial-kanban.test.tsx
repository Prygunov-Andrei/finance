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

const COLUMNS = [
  { id: 'c1', board: 'b1', key: 'new_clients', title: 'Новые клиенты', order: 1 },
  { id: 'c2', board: 'b1', key: 'meeting_scheduled', title: 'Назначена встреча', order: 2 },
  { id: 'c3', board: 'b1', key: 'meeting_done', title: 'Проведена встреча', order: 3 },
  { id: 'c4', board: 'b1', key: 'new_calculation', title: 'Новый расчет', order: 4 },
  { id: 'c5', board: 'b1', key: 'in_progress', title: 'В работе', order: 5 },
  { id: 'c6', board: 'b1', key: 'invoices_requested', title: 'Счета запрошены', order: 6 },
  { id: 'c7', board: 'b1', key: 'estimate_approval', title: 'Утверждение сметы', order: 7 },
  { id: 'c8', board: 'b1', key: 'estimate_approved', title: 'Смета утверждена', order: 8 },
  { id: 'c9', board: 'b1', key: 'kp_prepared', title: 'Подготовлено КП', order: 9 },
  { id: 'c10', board: 'b1', key: 'calculation_done', title: 'Расчет подготовлен', order: 10 },
  { id: 'c11', board: 'b1', key: 'no_result', title: 'Нет результата', order: 11 },
  { id: 'c12', board: 'b1', key: 'has_result', title: 'Есть результат', order: 12 },
];

function setupMockFetch() {
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('/boards/?key=')) {
      return okJson([{ id: 'b1', key: 'commercial_pipeline', title: 'Коммерческий пайплайн' }]);
    }
    if (url.includes('/columns/?board_id=b1')) {
      return okJson(COLUMNS);
    }
    if (url.includes('/cards/?board_id=b1')) {
      return okJson([]);
    }
    return okJson([]);
  });
}

describe('KanbanBoardPage with visibleColumnKeys (КП view)', () => {
  it('renders only КП columns when visibleColumnKeys is set', async () => {
    setupMockFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <KanbanBoardPage
          boardKey="commercial_pipeline"
          pageTitle="Канбан КП"
          cardType="commercial_case"
          visibleColumnKeys={['new_calculation', 'in_progress', 'invoices_requested', 'estimate_approval', 'estimate_approved', 'kp_prepared']}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Новый расчет')).toBeTruthy();
    expect(await screen.findByText('В работе')).toBeTruthy();
    expect(screen.queryByText('Новые клиенты')).toBeNull();
    expect(screen.queryByText('Назначена встреча')).toBeNull();
  });

  it('renders page title', async () => {
    setupMockFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <KanbanBoardPage
          boardKey="commercial_pipeline"
          pageTitle="Канбан КП"
          cardType="commercial_case"
          visibleColumnKeys={['new_calculation']}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Канбан КП')).toBeTruthy();
  });
});

describe('KanbanBoardPage with visibleColumnKeys (Marketing view)', () => {
  it('renders only Marketing columns when visibleColumnKeys is set', async () => {
    setupMockFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <KanbanBoardPage
          boardKey="commercial_pipeline"
          pageTitle="Канбан поиска объектов"
          cardType="commercial_case"
          visibleColumnKeys={['new_clients', 'meeting_scheduled', 'meeting_done', 'calculation_done', 'no_result', 'has_result']}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Новые клиенты')).toBeTruthy();
    expect(await screen.findByText('Назначена встреча')).toBeTruthy();
    expect(screen.queryByText('Новый расчет')).toBeNull();
    expect(screen.queryByText('В работе')).toBeNull();
  });
});

describe('KanbanBoardPage without visibleColumnKeys', () => {
  it('renders all columns when visibleColumnKeys is not set', async () => {
    setupMockFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <KanbanBoardPage
          boardKey="commercial_pipeline"
          pageTitle="Все колонки"
          cardType="commercial_case"
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Новые клиенты')).toBeTruthy();
    expect(await screen.findByText('Новый расчет')).toBeTruthy();
    expect(await screen.findByText('Есть результат')).toBeTruthy();
  });
});
