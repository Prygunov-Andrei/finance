import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ACCriterionEditor from './ACCriterionEditor';
import type { ACCriterion } from '../services/acRatingTypes';

const mockGetCriterion = vi.fn();
const mockCreateCriterion = vi.fn();
const mockUpdateCriterion = vi.fn();

vi.mock('../services/acRatingService', () => ({
  default: {
    getCriterion: (...args: unknown[]) => mockGetCriterion(...args),
    createCriterion: (...args: unknown[]) => mockCreateCriterion(...args),
    updateCriterion: (...args: unknown[]) => mockUpdateCriterion(...args),
  },
}));

const mockNavigate = vi.fn();
const mockUseParams = vi.fn();
vi.mock('@/hooks/erp-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
  useLocation: () => ({ pathname: '/hvac-rating/criteria' }),
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

vi.mock('@/components/common/ImageWithFallback', () => ({
  ImageWithFallback: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const SAMPLE: ACCriterion = {
  id: 7,
  code: 'noise_min',
  name_ru: 'Уровень шума (мин)',
  name_en: 'Noise (min)',
  name_de: '',
  name_pt: '',
  description_ru: 'Минимальный шум внутреннего блока',
  description_en: '',
  description_de: '',
  description_pt: '',
  unit: 'дБ',
  photo: '',
  photo_url: '/m/noise.jpg',
  value_type: 'numeric',
  group: 'acoustics',
  is_active: true,
  is_key_measurement: true,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-22T00:00:00Z',
};

beforeEach(() => {
  mockGetCriterion.mockReset();
  mockCreateCriterion.mockReset();
  mockUpdateCriterion.mockReset();
  mockNavigate.mockReset();
  mockUseParams.mockReset();

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

describe('ACCriterionEditor — create mode', () => {
  it('валидация — без code и name_ru показывает ошибки и не шлёт createCriterion', async () => {
    mockUseParams.mockReturnValue({});
    render(<ACCriterionEditor mode="create" />);
    await waitFor(() => {
      expect(screen.getByText(/Новый критерий/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('ac-criterion-save'));

    await waitFor(() => {
      expect(screen.getByTestId('ac-criterion-code-error')).toBeInTheDocument();
      expect(
        screen.getByTestId('ac-criterion-name-ru-error')
      ).toBeInTheDocument();
    });
    expect(mockCreateCriterion).not.toHaveBeenCalled();
  });

  it('создаёт критерий — POST с FormData (содержит code, name_ru)', async () => {
    mockUseParams.mockReturnValue({});
    mockCreateCriterion.mockResolvedValue({ ...SAMPLE, id: 99 });

    render(<ACCriterionEditor mode="create" />);
    await waitFor(() => screen.getByTestId('ac-criterion-code'));

    fireEvent.change(screen.getByTestId('ac-criterion-code'), {
      target: { value: 'wifi' },
    });
    fireEvent.change(screen.getByTestId('ac-criterion-name-ru'), {
      target: { value: 'Wi-Fi' },
    });
    fireEvent.click(screen.getByTestId('ac-criterion-save'));

    await waitFor(() => {
      expect(mockCreateCriterion).toHaveBeenCalledTimes(1);
    });
    const fd = mockCreateCriterion.mock.calls[0][0] as FormData;
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('code')).toBe('wifi');
    expect(fd.get('name_ru')).toBe('Wi-Fi');
    expect(mockNavigate).toHaveBeenCalledWith('/hvac-rating/criteria/edit/99');
  });
});

describe('ACCriterionEditor — edit mode', () => {
  it('подгружает критерий и блокирует поле code', async () => {
    mockUseParams.mockReturnValue({ id: '7' });
    mockGetCriterion.mockResolvedValue(SAMPLE);

    render(<ACCriterionEditor mode="edit" />);

    await waitFor(() => {
      const code = screen.getByTestId('ac-criterion-code') as HTMLInputElement;
      expect(code.value).toBe('noise_min');
      expect(code.disabled).toBe(true);
    });
    const nameRu = screen.getByTestId(
      'ac-criterion-name-ru'
    ) as HTMLInputElement;
    expect(nameRu.value).toBe('Уровень шума (мин)');
  });

  it('save → PATCH FormData без code, с обновлёнными полями', async () => {
    mockUseParams.mockReturnValue({ id: '7' });
    mockGetCriterion.mockResolvedValue(SAMPLE);
    mockUpdateCriterion.mockResolvedValue({ ...SAMPLE, name_ru: 'New name' });

    render(<ACCriterionEditor mode="edit" />);
    await waitFor(() => screen.getByTestId('ac-criterion-name-ru'));

    fireEvent.change(screen.getByTestId('ac-criterion-name-ru'), {
      target: { value: 'New name' },
    });
    fireEvent.click(screen.getByTestId('ac-criterion-save'));

    await waitFor(() => {
      expect(mockUpdateCriterion).toHaveBeenCalledTimes(1);
    });
    const [id, fd] = mockUpdateCriterion.mock.calls[0];
    expect(id).toBe(7);
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).get('name_ru')).toBe('New name');
    // code не передаётся в edit-режиме
    expect((fd as FormData).get('code')).toBeNull();
  });
});
