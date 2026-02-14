import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock fetch globally ──
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Динамический импорт, чтобы fetch был подменён до инициализации модуля
let api: any;

beforeEach(async () => {
  vi.resetModules();
  mockFetch.mockReset();
  const mod = await import('../lib/api');
  api = mod.api;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Хелпер для мока успешного ответа ──
const mockSuccess = (data: any) => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
};

const mockError = (status: number, detail: string) => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: 'Error',
    text: async () => JSON.stringify({ detail }),
  });
};

// =============================================================================
// Notifications
// =============================================================================

describe('getNotifications', () => {
  it('calls GET /notifications/', async () => {
    const mockData = [
      { id: 1, title: 'Новый счёт', message: 'Счёт #42 добавлен', is_read: false, created_at: '2026-02-14T10:00:00Z' },
      { id: 2, title: 'Одобрен', message: 'Счёт #40 одобрен', is_read: true, created_at: '2026-02-13T09:00:00Z' },
    ];

    mockSuccess(mockData);

    const result = await api.getNotifications();
    expect(result).toEqual(mockData);
    expect(result).toHaveLength(2);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/notifications/');
  });
});

describe('getUnreadNotificationCount', () => {
  it('calls GET /notifications/unread_count/', async () => {
    mockSuccess({ count: 5 });

    const result = await api.getUnreadNotificationCount();
    expect(result.count).toBe(5);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/notifications/unread_count/');
  });
});

describe('markNotificationRead', () => {
  it('calls POST /notifications/{id}/mark_read/', async () => {
    mockSuccess({ id: 3, is_read: true });

    const result = await api.markNotificationRead(3);
    expect(result.is_read).toBe(true);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/notifications/3/mark_read/');
    expect(opts.method).toBe('POST');
  });
});

describe('markAllNotificationsRead', () => {
  it('calls POST /notifications/mark_all_read/', async () => {
    mockSuccess({ status: 'ok' });

    await api.markAllNotificationsRead();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/notifications/mark_all_read/');
    expect(opts.method).toBe('POST');
  });
});

// =============================================================================
// Supply Requests
// =============================================================================

describe('getSupplyRequests', () => {
  it('returns paginated supply requests with params', async () => {
    const mockResponse = {
      count: 10,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          bitrix_deal_id: '12345',
          status: 'completed',
          integration_name: 'Наш Битрикс',
          created_at: '2026-02-10T08:00:00Z',
        },
      ],
    };

    mockSuccess(mockResponse);

    const result = await api.getSupplyRequests('status=completed&page=1');
    expect(result.count).toBe(10);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe('completed');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/supply-requests/');
    expect(url).toContain('status=completed');
    expect(url).toContain('page=1');
  });

  it('sends no query params when called without args', async () => {
    mockSuccess({ count: 0, next: null, previous: null, results: [] });

    await api.getSupplyRequests();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/supply-requests/');
    expect(url).not.toContain('?');
  });
});

describe('getSupplyRequest', () => {
  it('calls GET /supply-requests/{id}/', async () => {
    const mockDetail = {
      id: 7,
      bitrix_deal_id: '99999',
      status: 'processing',
      integration_name: 'Наш Битрикс',
      invoices: [],
      created_at: '2026-02-12T10:00:00Z',
    };

    mockSuccess(mockDetail);

    const result = await api.getSupplyRequest(7);
    expect(result.id).toBe(7);
    expect(result.status).toBe('processing');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/supply-requests/7/');
  });
});

// =============================================================================
// Bitrix Integrations
// =============================================================================

describe('getBitrixIntegrations', () => {
  it('calls GET /bitrix-integrations/', async () => {
    const mockData = [
      { id: 1, name: 'Наш Битрикс', portal_url: 'https://company.bitrix24.ru', is_active: true },
    ];

    mockSuccess(mockData);

    const result = await api.getBitrixIntegrations();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Наш Битрикс');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/bitrix-integrations/');
  });
});

describe('createBitrixIntegration', () => {
  it('calls POST /bitrix-integrations/ with body', async () => {
    const payload = {
      name: 'Новый Битрикс',
      portal_url: 'https://new.bitrix24.ru',
      target_category_id: 0,
      target_stage_id: 'C1:UC_ABCDEF',
      is_active: true,
    };

    mockSuccess({ id: 2, ...payload });

    const result = await api.createBitrixIntegration(payload);
    expect(result.id).toBe(2);
    expect(result.name).toBe('Новый Битрикс');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/bitrix-integrations/');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.name).toBe('Новый Битрикс');
    expect(body.portal_url).toBe('https://new.bitrix24.ru');
  });
});

// =============================================================================
// Invoices
// =============================================================================

describe('getInvoices', () => {
  it('returns paginated invoices with params', async () => {
    const mockResponse = {
      count: 42,
      next: 'http://localhost/api/v1/invoices/?page=2',
      previous: null,
      results: [
        {
          id: 1,
          invoice_number: 'СЧ-001',
          supplier_name: 'ООО Поставка',
          total_amount: '150000.00',
          status: 'in_registry',
          payment_date: '2026-02-20',
        },
      ],
    };

    mockSuccess(mockResponse);

    const result = await api.getInvoices('status=in_registry&page=1');
    expect(result.count).toBe(42);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe('in_registry');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/invoices/');
    expect(url).toContain('status=in_registry');
    expect(url).toContain('page=1');
  });

  it('sends no query params when called without args', async () => {
    mockSuccess({ count: 0, next: null, previous: null, results: [] });

    await api.getInvoices();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/invoices/');
    expect(url).not.toContain('?');
  });
});

describe('getInvoice', () => {
  it('calls GET /invoices/{id}/', async () => {
    const mockInvoice = {
      id: 15,
      invoice_number: 'СЧ-015',
      supplier_name: 'ООО Стройматериал',
      total_amount: '250000.00',
      status: 'pending_review',
      items: [
        { id: 1, product_name: 'Кабель 3x2.5', quantity: 100, unit_price: '2500.00' },
      ],
    };

    mockSuccess(mockInvoice);

    const result = await api.getInvoice(15);
    expect(result.id).toBe(15);
    expect(result.invoice_number).toBe('СЧ-015');
    expect(result.items).toHaveLength(1);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/invoices/15/');
  });
});

describe('submitInvoiceToRegistry', () => {
  it('calls POST /invoices/{id}/submit_to_registry/', async () => {
    mockSuccess({ id: 15, status: 'in_registry' });

    const result = await api.submitInvoiceToRegistry(15);
    expect(result.status).toBe('in_registry');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/invoices/15/submit_to_registry/');
    expect(opts.method).toBe('POST');
  });
});

describe('approveInvoice', () => {
  it('calls POST /invoices/{id}/approve/ with comment', async () => {
    mockSuccess({ id: 15, status: 'approved' });

    const result = await api.approveInvoice(15, 'Оплатить сегодня');
    expect(result.status).toBe('approved');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/invoices/15/approve/');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.comment).toBe('Оплатить сегодня');
  });

  it('sends empty comment when not provided', async () => {
    mockSuccess({ id: 15, status: 'approved' });

    await api.approveInvoice(15);

    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.comment).toBe('');
  });
});

describe('rejectInvoice', () => {
  it('calls POST /invoices/{id}/reject/ with comment', async () => {
    mockSuccess({ id: 15, status: 'rejected' });

    const result = await api.rejectInvoice(15, 'Неверные реквизиты');
    expect(result.status).toBe('rejected');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/invoices/15/reject/');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.comment).toBe('Неверные реквизиты');
  });
});

describe('rescheduleInvoice', () => {
  it('calls POST /invoices/{id}/reschedule/ with date and comment', async () => {
    mockSuccess({ id: 15, status: 'in_registry', payment_date: '2026-03-01' });

    const result = await api.rescheduleInvoice(15, '2026-03-01', 'Перенос на следующий месяц');
    expect(result.payment_date).toBe('2026-03-01');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/invoices/15/reschedule/');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.new_date).toBe('2026-03-01');
    expect(body.comment).toBe('Перенос на следующий месяц');
  });
});

describe('getInvoiceDashboard', () => {
  it('calls GET /invoices/dashboard/', async () => {
    const mockDashboard = {
      account_balances: [
        { id: 1, name: 'Основной', number: '40702810000000000001', internal_balance: '1000000.00', currency: 'RUB' },
      ],
      registry_summary: {
        total_count: 15,
        total_amount: '500000.00',
        overdue_count: 2,
        overdue_amount: '80000.00',
        today_count: 3,
        today_amount: '120000.00',
        this_week_count: 5,
        this_week_amount: '200000.00',
        this_month_count: 10,
        this_month_amount: '400000.00',
      },
      by_object: [],
      by_category: [],
    };

    mockSuccess(mockDashboard);

    const result = await api.getInvoiceDashboard();
    expect(result.account_balances).toHaveLength(1);
    expect(result.registry_summary.total_count).toBe(15);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/invoices/dashboard/');
  });
});

// =============================================================================
// Recurring Payments
// =============================================================================

describe('getRecurringPayments', () => {
  it('returns paginated recurring payments with params', async () => {
    const mockResponse = {
      count: 3,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          name: 'Аренда офиса',
          amount: '100000.00',
          frequency: 'monthly',
          is_active: true,
        },
      ],
    };

    mockSuccess(mockResponse);

    const result = await api.getRecurringPayments('is_active=true');
    expect(result.count).toBe(3);
    expect(result.results[0].name).toBe('Аренда офиса');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/recurring-payments/');
    expect(url).toContain('is_active=true');
  });

  it('sends no query params when called without args', async () => {
    mockSuccess({ count: 0, next: null, previous: null, results: [] });

    await api.getRecurringPayments();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/recurring-payments/');
    expect(url).not.toContain('?');
  });
});

describe('createRecurringPayment', () => {
  it('calls POST /recurring-payments/ with body', async () => {
    const payload = {
      name: 'Аренда склада',
      amount: '50000.00',
      frequency: 'monthly',
      day_of_month: 10,
      counterparty: 1,
      account: 1,
      is_active: true,
    };

    mockSuccess({ id: 5, ...payload });

    const result = await api.createRecurringPayment(payload);
    expect(result.id).toBe(5);
    expect(result.name).toBe('Аренда склада');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/recurring-payments/');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.name).toBe('Аренда склада');
    expect(body.amount).toBe('50000.00');
    expect(body.frequency).toBe('monthly');
  });
});

// =============================================================================
// Income Records
// =============================================================================

describe('getIncomeRecords', () => {
  it('returns paginated income records with params', async () => {
    const mockResponse = {
      count: 8,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          amount: '500000.00',
          date: '2026-02-10',
          counterparty_name: 'ООО Заказчик',
          category_name: 'Оплата по договору',
        },
      ],
    };

    mockSuccess(mockResponse);

    const result = await api.getIncomeRecords('page=1&page_size=20');
    expect(result.count).toBe(8);
    expect(result.results[0].amount).toBe('500000.00');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/income-records/');
    expect(url).toContain('page=1');
    expect(url).toContain('page_size=20');
  });

  it('sends no query params when called without args', async () => {
    mockSuccess({ count: 0, next: null, previous: null, results: [] });

    await api.getIncomeRecords();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/income-records/');
    expect(url).not.toContain('?');
  });
});

describe('createIncomeRecord', () => {
  it('calls POST /income-records/ with body', async () => {
    const payload = {
      amount: '250000.00',
      date: '2026-02-14',
      account: 1,
      counterparty: 2,
      category: 3,
      description: 'Оплата за февраль',
    };

    mockSuccess({ id: 10, ...payload });

    const result = await api.createIncomeRecord(payload);
    expect(result.id).toBe(10);
    expect(result.amount).toBe('250000.00');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/income-records/');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.amount).toBe('250000.00');
    expect(body.date).toBe('2026-02-14');
    expect(body.description).toBe('Оплата за февраль');
  });
});

// =============================================================================
// Error handling
// =============================================================================

describe('Supply API error handling', () => {
  it('throws error with detail on 400', async () => {
    mockError(400, 'Некорректные данные');

    await expect(api.getInvoices()).rejects.toThrow('detail: Некорректные данные');
  });

  it('throws error on 404 for invoice', async () => {
    mockError(404, 'Не найдено');

    await expect(api.getInvoice(999)).rejects.toThrow('detail: Не найдено');
  });
});
