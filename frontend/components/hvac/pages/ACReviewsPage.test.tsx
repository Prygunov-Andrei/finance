import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ACReviewsPage from './ACReviewsPage';
import type { ACReview } from '../services/acRatingTypes';

const mockGetReviews = vi.fn();
const mockUpdateStatus = vi.fn();
const mockBulkUpdate = vi.fn();
const mockDeleteReview = vi.fn();

vi.mock('../services/acRatingService', () => ({
  default: {
    getReviews: (...args: unknown[]) => mockGetReviews(...args),
    updateReviewStatus: (...args: unknown[]) => mockUpdateStatus(...args),
    bulkUpdateReviews: (...args: unknown[]) => mockBulkUpdate(...args),
    deleteReview: (...args: unknown[]) => mockDeleteReview(...args),
  },
}));

vi.mock('../hooks/useHvacAuth', () => ({
  useHvacAuth: () => ({ user: { is_staff: true } }),
}));

const mockNavigate = vi.fn();
vi.mock('@/hooks/erp-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
  useLocation: () => ({ pathname: '/hvac-rating/reviews' }),
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

const SAMPLE: ACReview[] = [
  {
    id: 1,
    model: 100,
    model_brand: 'Daikin',
    model_inner_unit: 'FTXM20R',
    model_slug: 'daikin-ftxm20r',
    author_name: 'Иван',
    rating: 5,
    pros: 'Тихий',
    cons: 'Дорого',
    comment: 'Доволен',
    status: 'pending',
    ip_address: '127.0.0.1',
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
  },
  {
    id: 2,
    model: 101,
    model_brand: 'Mitsubishi',
    model_inner_unit: 'MSZ-AP25VG',
    model_slug: 'mitsubishi-msz-ap25vg',
    author_name: 'Анна',
    rating: 4,
    pros: 'Дизайн',
    cons: '',
    comment: '',
    status: 'pending',
    ip_address: null,
    created_at: '2026-04-21T00:00:00Z',
    updated_at: '2026-04-21T00:00:00Z',
  },
];

beforeEach(() => {
  mockGetReviews.mockReset();
  mockUpdateStatus.mockReset();
  mockBulkUpdate.mockReset();
  mockDeleteReview.mockReset();
  mockNavigate.mockReset();

  mockGetReviews.mockResolvedValue({
    items: SAMPLE,
    next: null,
    count: SAMPLE.length,
  });

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

describe('ACReviewsPage', () => {
  it('по умолчанию шлёт status=pending', async () => {
    render(<ACReviewsPage />);
    await waitFor(() =>
      expect(screen.getByTestId('ac-review-row-1')).toBeInTheDocument()
    );
    const firstCall = mockGetReviews.mock.calls[0][0];
    expect(firstCall).toMatchObject({ status: 'pending' });
  });

  it('inline approve → PATCH updateReviewStatus(id, "approved")', async () => {
    mockUpdateStatus.mockResolvedValue({ ...SAMPLE[0], status: 'approved' });
    render(<ACReviewsPage />);
    await waitFor(() =>
      expect(screen.getByTestId('ac-review-row-1')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId('ac-review-approve-1'));

    await waitFor(() => {
      expect(mockUpdateStatus).toHaveBeenCalledWith(1, 'approved');
    });
  });

  it('inline reject → PATCH updateReviewStatus(id, "rejected")', async () => {
    mockUpdateStatus.mockResolvedValue({ ...SAMPLE[0], status: 'rejected' });
    render(<ACReviewsPage />);
    await waitFor(() =>
      expect(screen.getByTestId('ac-review-row-2')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId('ac-review-reject-2'));

    await waitFor(() => {
      expect(mockUpdateStatus).toHaveBeenCalledWith(2, 'rejected');
    });
  });

  it('bulk approve → POST bulk-update', async () => {
    mockBulkUpdate.mockResolvedValue({ updated: 2, errors: [] });
    render(<ACReviewsPage />);
    await waitFor(() =>
      expect(screen.getByTestId('ac-review-row-1')).toBeInTheDocument()
    );

    // выбираем оба
    const checkboxes = screen.getAllByRole('checkbox');
    // первый — header (Выбрать все)
    fireEvent.click(checkboxes[0]);

    await waitFor(() => {
      expect(screen.getByTestId('ac-reviews-bulk-approve')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('ac-reviews-bulk-approve'));

    await waitFor(() => {
      expect(mockBulkUpdate).toHaveBeenCalledTimes(1);
    });
    const [ids, status] = mockBulkUpdate.mock.calls[0];
    expect(ids).toEqual([1, 2]);
    expect(status).toBe('approved');
  });
});
