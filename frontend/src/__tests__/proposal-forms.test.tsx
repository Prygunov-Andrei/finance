import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const okJson = (data: any) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
  text: async () => JSON.stringify(data),
});

function setupMockApi() {
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('/objects/')) return okJson([]);
    if (url.includes('/legal-entities/')) return okJson([]);
    if (url.includes('/estimates/estimates/')) return okJson([]);
    if (url.includes('/estimates/mounting-estimates/')) return okJson([]);
    if (url.includes('/proposals/front-of-work-items/')) return okJson([]);
    if (url.includes('/proposals/mounting-conditions/')) return okJson([]);
    if (url.includes('/counterparties/')) return okJson([]);
    return okJson([]);
  });
}

describe('CreateTechnicalProposalDialog', () => {
  it('renders dialog with tabs: Основные поля, Сметы, Фронт работ', async () => {
    setupMockApi();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { CreateTechnicalProposalDialog } = await import(
      '../components/proposals/CreateTechnicalProposalDialog'
    );

    render(
      <QueryClientProvider client={qc}>
        <CreateTechnicalProposalDialog open={true} onOpenChange={() => {}} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Основные поля')).toBeTruthy();
    expect(screen.getByText('Сметы')).toBeTruthy();
    expect(screen.getByText('Фронт работ')).toBeTruthy();
  });
});

describe('CreateMountingProposalDialog', () => {
  it('renders dialog with tabs: Основные поля, Монтажные сметы, Условия для МП', async () => {
    setupMockApi();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { CreateMountingProposalDialog } = await import(
      '../components/proposals/CreateMountingProposalDialog'
    );

    render(
      <QueryClientProvider client={qc}>
        <CreateMountingProposalDialog open={true} onOpenChange={() => {}} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Основные поля')).toBeTruthy();
    expect(screen.getByText('Монтажные сметы')).toBeTruthy();
    expect(screen.getByText('Условия для МП')).toBeTruthy();
  });
});
