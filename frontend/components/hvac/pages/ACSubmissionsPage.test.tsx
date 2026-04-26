import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ACSubmissionsPage from './ACSubmissionsPage';
import type { ACSubmissionListItem } from '../services/acRatingTypes';

const mockGetSubmissions = vi.fn();
const mockGetSubmission = vi.fn();
const mockUpdateSubmission = vi.fn();
const mockBulkUpdate = vi.fn();
const mockDeleteSubmission = vi.fn();
const mockConvertSubmission = vi.fn();
const mockGetBrands = vi.fn();

vi.mock('../services/acRatingService', () => ({
  default: {
    getSubmissions: (...args: unknown[]) => mockGetSubmissions(...args),
    getSubmission: (...args: unknown[]) => mockGetSubmission(...args),
    updateSubmission: (...args: unknown[]) => mockUpdateSubmission(...args),
    bulkUpdateSubmissions: (...args: unknown[]) => mockBulkUpdate(...args),
    deleteSubmission: (...args: unknown[]) => mockDeleteSubmission(...args),
    convertSubmission: (...args: unknown[]) => mockConvertSubmission(...args),
    getBrands: (...args: unknown[]) => mockGetBrands(...args),
  },
}));

vi.mock('../hooks/useHvacAuth', () => ({
  useHvacAuth: () => ({ user: { is_staff: true } }),
}));

const mockNavigate = vi.fn();
vi.mock('@/hooks/erp-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
  useLocation: () => ({ pathname: '/hvac-rating/submissions' }),
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const SAMPLE: ACSubmissionListItem[] = [
  {
    id: 1,
    status: 'pending',
    brand_name: 'Daikin',
    series: 'FTXM',
    inner_unit: 'FTXM20R',
    outer_unit: 'RXM20R',
    nominal_capacity_watt: 2000,
    price: '50000',
    submitter_email: 'a@b.c',
    photos_count: 3,
    primary_photo_url: '',
    converted_model_id: null,
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
  },
  {
    id: 2,
    status: 'pending',
    brand_name: '—',
    series: '',
    inner_unit: 'CUSTOM-X',
    outer_unit: 'CUSTOM-X-OUT',
    nominal_capacity_watt: 3500,
    price: null,
    submitter_email: 'c@d.e',
    photos_count: 5,
    primary_photo_url: '',
    converted_model_id: null,
    created_at: '2026-04-21T00:00:00Z',
    updated_at: '2026-04-21T00:00:00Z',
  },
];

beforeEach(() => {
  mockGetSubmissions.mockReset();
  mockGetSubmission.mockReset();
  mockUpdateSubmission.mockReset();
  mockBulkUpdate.mockReset();
  mockDeleteSubmission.mockReset();
  mockConvertSubmission.mockReset();
  mockGetBrands.mockReset();
  mockNavigate.mockReset();

  mockGetSubmissions.mockResolvedValue({
    items: SAMPLE,
    next: null,
    count: SAMPLE.length,
  });
  mockGetBrands.mockResolvedValue({ items: [], next: null, count: 0 });

  (
    globalThis as unknown as { ResizeObserver: typeof ResizeObserver }
  ).ResizeObserver = NoopResizeObserver as unknown as typeof ResizeObserver;
  if (typeof window !== 'undefined') {
    window.matchMedia =
      window.matchMedia ||
      (vi.fn().mockImplementation((q: string) => ({
        matches: false,
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia);
    Element.prototype.hasPointerCapture ||= () => false;
    Element.prototype.scrollIntoView ||= () => {};
  }
});

describe('ACSubmissionsPage', () => {
  it('по умолчанию шлёт status=pending', async () => {
    render(<ACSubmissionsPage />);
    await waitFor(() =>
      expect(screen.getByTestId('ac-submission-row-1')).toBeInTheDocument()
    );
    const firstCall = mockGetSubmissions.mock.calls[0][0];
    expect(firstCall).toMatchObject({ status: 'pending' });
  });

  it('inline approve → PATCH updateSubmission(id, {status: "approved"})', async () => {
    mockUpdateSubmission.mockResolvedValue({ ...SAMPLE[0], status: 'approved' });
    render(<ACSubmissionsPage />);
    await waitFor(() =>
      expect(screen.getByTestId('ac-submission-row-1')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId('ac-submission-approve-1'));

    await waitFor(() => {
      expect(mockUpdateSubmission).toHaveBeenCalledWith(1, {
        status: 'approved',
      });
    });
  });

  it('convert → POST convertSubmission + navigate(redirect_to)', async () => {
    mockConvertSubmission.mockResolvedValue({
      submission_id: 1,
      created_model_id: 42,
      created_model_slug: 'daikin-ftxm20r',
      created_brand: false,
      redirect_to: '/hvac-rating/models/edit/42/',
    });
    render(<ACSubmissionsPage />);
    await waitFor(() =>
      expect(screen.getByTestId('ac-submission-row-1')).toBeInTheDocument()
    );

    // У строки 1 brand привязан, конверсия должна работать
    fireEvent.click(screen.getByTestId('ac-submission-convert-1'));

    // Confirm dialog
    await waitFor(() =>
      expect(
        screen.getByTestId('ac-submission-convert-confirm')
      ).toBeInTheDocument()
    );
    fireEvent.click(screen.getByTestId('ac-submission-convert-confirm'));

    await waitFor(() => {
      expect(mockConvertSubmission).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/hvac-rating/models/edit/42/');
    });
  });

  it('convert disabled для строки без бренда (brand_name === "—")', async () => {
    render(<ACSubmissionsPage />);
    await waitFor(() =>
      expect(screen.getByTestId('ac-submission-row-2')).toBeInTheDocument()
    );

    const btn = screen.getByTestId('ac-submission-convert-2');
    expect(btn).toBeDisabled();
  });

  it('bulk approve → POST bulk-update', async () => {
    mockBulkUpdate.mockResolvedValue({ updated: 2, errors: [] });
    render(<ACSubmissionsPage />);
    await waitFor(() =>
      expect(screen.getByTestId('ac-submission-row-1')).toBeInTheDocument()
    );

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]); // header — Выбрать все

    await waitFor(() =>
      expect(
        screen.getByTestId('ac-submissions-bulk-approve')
      ).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId('ac-submissions-bulk-approve'));

    await waitFor(() => {
      expect(mockBulkUpdate).toHaveBeenCalledTimes(1);
    });
    const [ids, status] = mockBulkUpdate.mock.calls[0];
    expect(ids).toEqual([1, 2]);
    expect(status).toBe('approved');
  });
});
