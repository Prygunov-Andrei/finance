import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import type { RatingModelDetail, RatingReview } from '@/lib/api/types/rating';
import DetailReviews from './DetailReviews';

const baseDetail: RatingModelDetail = {
  id: 42,
  slug: 'test',
  brand: { id: 1, name: 'Casarte', logo: '' },
  series: '',
  inner_unit: 'CAS-35',
  outer_unit: '',
  nominal_capacity: null,
  total_index: 78,
  index_max: 100,
  publish_status: 'published',
  region_availability: [],
  price: null,
  pros_text: '',
  cons_text: '',
  youtube_url: '',
  rutube_url: '',
  vk_url: '',
  photos: [],
  suppliers: [],
  parameter_scores: [],
  raw_values: [],
  methodology_version: '2026.04',
  rank: 1,
  median_total_index: 70,
  editorial_lede: '',
  editorial_body: '',
  editorial_quote: '',
  editorial_quote_author: '',
  inner_unit_dimensions: '',
  inner_unit_weight_kg: null,
  outer_unit_dimensions: '',
  outer_unit_weight_kg: null,
};

const mkReview = (over: Partial<RatingReview> = {}): RatingReview => ({
  id: 1,
  author_name: 'Иван',
  rating: 5,
  pros: 'тихий\nкрасивый',
  cons: 'дорогой',
  comment: 'Отличный кондиционер, работает уже полгода.',
  created_at: '2026-03-15T12:00:00Z',
  ...over,
});

describe('DetailReviews', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('рендерит skeleton во время загрузки и summary после ответа', async () => {
    let resolveFetch: ((r: Response) => void) | null = null;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    render(<DetailReviews detail={baseDetail} />);
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();

    await act(async () => {
      resolveFetch!(
        new Response(JSON.stringify([mkReview()]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    await waitFor(() =>
      expect(screen.getByText(/средняя оценка/i)).toBeTruthy(),
    );
    expect(screen.getByText('Иван')).toBeTruthy();
  });

  it('считает средний рейтинг и распределение по звёздам', async () => {
    const reviews = [
      mkReview({ id: 1, rating: 5 }),
      mkReview({ id: 2, rating: 5 }),
      mkReview({ id: 3, rating: 4 }),
      mkReview({ id: 4, rating: 3 }),
      mkReview({ id: 5, rating: 4 }),
    ];
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(reviews), { status: 200 }),
    );
    render(<DetailReviews detail={baseDetail} />);
    await waitFor(() => expect(screen.getByText('4.2')).toBeTruthy());
  });

  it('empty state → tab переключается на write-form', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    render(<DetailReviews detail={baseDetail} />);
    await waitFor(() =>
      expect(screen.getByText(/Будьте первым/)).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: /Опубликовать отзыв/ })).toBeTruthy();
  });

  it('submit с honeypot=заполнен — блокируется на фронте', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const { container } = render(<DetailReviews detail={baseDetail} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Опубликовать отзыв/ })).toBeTruthy(),
    );

    const nameInput = container.querySelector(
      'input[type="text"]:not([name="website"])',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Иван' } });
    const stars = container.querySelectorAll('[role="radio"]');
    fireEvent.click(stars[4]);
    const textareas = container.querySelectorAll('textarea');
    fireEvent.change(textareas[textareas.length - 1], {
      target: { value: 'Отличный кондиционер, стоит покупать' },
    });

    const honeypot = container.querySelector(
      'input[name="website"]',
    ) as HTMLInputElement;
    fireEvent.change(honeypot, { target: { value: 'http://spam.example' } });

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });

    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    expect(screen.getByText(/спам/i)).toBeTruthy();
  });

  it('submit 201 сбрасывает форму и показывает success', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 99,
            model: 42,
            author_name: 'Иван',
            rating: 5,
            pros: '',
            cons: '',
            comment: 'Отличный кондиционер, стоит покупать',
          }),
          { status: 201 },
        ),
      );
    const { container } = render(<DetailReviews detail={baseDetail} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Опубликовать отзыв/ })).toBeTruthy(),
    );

    const nameInput = container.querySelector(
      'input[type="text"]:not([name="website"])',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Иван' } });
    const stars = container.querySelectorAll('[role="radio"]');
    fireEvent.click(stars[4]);
    const textareas = container.querySelectorAll('textarea');
    fireEvent.change(textareas[textareas.length - 1], {
      target: { value: 'Отличный кондиционер, стоит покупать' },
    });

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() =>
      expect(screen.getByText(/отправлен на модерацию/i)).toBeTruthy(),
    );
    const [, postCall] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(postCall[0]).toMatch(/\/api\/public\/v1\/rating\/reviews\/$/);
    const body = JSON.parse(postCall[1].body);
    expect(body).toMatchObject({
      model: 42,
      author_name: 'Иван',
      rating: 5,
      website: '',
    });
  });

  it('submit 429 показывает ratelimit error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response('', { status: 429 }));
    const { container } = render(<DetailReviews detail={baseDetail} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Опубликовать отзыв/ })).toBeTruthy(),
    );

    const nameInput = container.querySelector(
      'input[type="text"]:not([name="website"])',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Иван' } });
    fireEvent.click(container.querySelectorAll('[role="radio"]')[4]);
    const textareas = container.querySelectorAll('textarea');
    fireEvent.change(textareas[textareas.length - 1], {
      target: { value: 'Отличный кондиционер, стоит покупать' },
    });

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() =>
      expect(screen.getByText(/Слишком много отзывов/)).toBeTruthy(),
    );
  });

  it('load error — fallback с "временно недоступны"', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('network'),
    );
    render(<DetailReviews detail={baseDetail} />);
    await waitFor(() =>
      expect(screen.getByText(/временно недоступны/)).toBeTruthy(),
    );
  });
});
