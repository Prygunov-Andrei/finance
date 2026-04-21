'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  RatingModelDetail,
  RatingReview,
} from '@/lib/api/types/rating';
import { Eyebrow, H, T } from './primitives';

type Props = { detail: RatingModelDetail };

type Tab = 'read' | 'write';
type StarFilter = 'all' | 5 | 4 | 3;
type SortKey = 'new' | 'rating_desc' | 'rating_asc';

function reviewsApiBase(): string {
  if (typeof window === 'undefined') return '';
  return (process.env.NEXT_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
}

export default function DetailReviews({ detail }: Props) {
  const modelId = detail.id;
  const [reviews, setReviews] = useState<RatingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<Tab>('read');
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = `${reviewsApiBase()}/api/public/v1/rating/models/${modelId}/reviews/`;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as RatingReview[];
        if (!cancelled) setReviews(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  const isEmpty = !loading && !loadError && reviews.length === 0;
  useEffect(() => {
    if (isEmpty) setTab('write');
  }, [isEmpty]);

  return (
    <section
      data-anchor="reviews"
      className="rt-detail-reviews"
      style={{
        padding: '40px 40px',
        borderTop: '1px solid hsl(var(--rt-border-subtle))',
      }}
    >
      <div
        className="rt-reviews-top"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 1fr',
          gap: 56,
          marginBottom: 28,
          alignItems: 'start',
        }}
      >
        <ReviewsSummary
          reviews={reviews}
          loading={loading}
          loadError={loadError}
          brand={detail.brand.name}
          innerUnit={detail.inner_unit}
        />
        <ReviewsTabs
          tab={tab}
          onTab={setTab}
          modelId={modelId}
          hideReadTab={isEmpty}
          onSubmitted={(created) => {
            setTab('read');
            setSubmittedAt(Date.now());
            void created;
          }}
        />
      </div>

      {submittedAt != null && (
        <div
          role="status"
          style={{
            padding: '12px 18px',
            marginBottom: 20,
            background: 'hsl(var(--rt-accent-bg))',
            border: '1px solid hsl(var(--rt-accent))',
            borderRadius: 4,
          }}
        >
          <T size={12} color="hsl(var(--rt-accent))" weight={600}>
            Отзыв отправлен на модерацию. После проверки он появится в списке.
          </T>
        </div>
      )}

      {tab === 'read' && !loading && !loadError && reviews.length > 0 && (
        <ReviewsList reviews={reviews} />
      )}
      {tab === 'read' && loading && <ReviewsSkeleton />}
      {tab === 'read' && loadError && (
        <div
          style={{
            padding: '20px 22px',
            background: 'hsl(var(--rt-alt))',
            border: '1px dashed hsl(var(--rt-border))',
            borderRadius: 6,
          }}
        >
          <T size={12} color="hsl(var(--rt-ink-60))">
            Отзывы временно недоступны. Попробуйте обновить страницу позже.
          </T>
        </div>
      )}

      <style>{`
        @media (max-width: 899px) {
          .rt-detail-reviews { padding: 28px 18px !important; }
          .rt-reviews-top { grid-template-columns: 1fr !important; gap: 24px !important; }
          .rt-reviews-cards { grid-template-columns: 1fr !important; }
          .rt-reviews-summary-row { flex-direction: column !important; align-items: flex-start !important; gap: 18px !important; }
        }
      `}</style>
    </section>
  );
}

function ReviewsSummary({
  reviews,
  loading,
  loadError,
  brand,
  innerUnit,
}: {
  reviews: RatingReview[];
  loading: boolean;
  loadError: boolean;
  brand: string;
  innerUnit: string;
}) {
  const count = reviews.length;
  const avg =
    count === 0
      ? null
      : reviews.reduce((s, r) => s + r.rating, 0) / count;
  const counts = [1, 2, 3, 4, 5].map(
    (s) => reviews.filter((r) => r.rating === s).length,
  );
  const maxCount = Math.max(...counts, 1);

  if (loading) {
    return (
      <div>
        <Eyebrow>Отзывы покупателей</Eyebrow>
        <H size={26} serif style={{ marginTop: 6 }}>
          Загружаем отзывы…
        </H>
      </div>
    );
  }
  if (loadError) {
    return (
      <div>
        <Eyebrow>Отзывы покупателей</Eyebrow>
        <H size={26} serif style={{ marginTop: 6 }}>
          Не удалось загрузить
        </H>
      </div>
    );
  }
  if (count === 0) {
    return (
      <div>
        <Eyebrow>Отзывы покупателей</Eyebrow>
        <H
          size={26}
          serif
          style={{ marginTop: 6, letterSpacing: -0.3, textWrap: 'balance' }}
        >
          Будьте первым, кто оставит отзыв о {brand} {innerUnit}
        </H>
        <T
          size={13}
          color="hsl(var(--rt-ink-60))"
          style={{ marginTop: 12, display: 'block', lineHeight: 1.6 }}
        >
          Оценка и комментарий появятся в карточке после модерации.
        </T>
      </div>
    );
  }

  return (
    <div>
      <Eyebrow>Отзывы покупателей</Eyebrow>
      <H size={26} serif style={{ marginTop: 6, letterSpacing: -0.3 }}>
        {count} {pluralReview(count)} · средняя оценка
      </H>
      <div
        className="rt-reviews-summary-row"
        style={{
          marginTop: 22,
          display: 'flex',
          gap: 28,
          alignItems: 'flex-end',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--rt-font-serif)',
              fontSize: 72,
              fontWeight: 600,
              lineHeight: 0.9,
              color: 'hsl(var(--rt-accent))',
              letterSpacing: -2,
            }}
          >
            {avg != null ? avg.toFixed(1) : '—'}
          </div>
          <div style={{ display: 'flex', gap: 2, marginTop: 8 }}>
            <Stars value={avg ?? 0} size={16} />
          </div>
          <T
            size={11}
            color="hsl(var(--rt-ink-60))"
            mono
            style={{ marginTop: 10, display: 'block' }}
          >
            из {count} {pluralReview(count)}
          </T>
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {[5, 4, 3, 2, 1].map((star) => {
            const n = counts[star - 1];
            const pct = maxCount > 0 ? (n / maxCount) * 100 : 0;
            const pctDisplay = count > 0 ? Math.round((n / count) * 100) : 0;
            const barColor =
              star >= 4
                ? 'hsl(var(--rt-accent))'
                : star === 3
                  ? 'hsl(var(--rt-ink-40))'
                  : '#b24a3b';
            return (
              <div
                key={star}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr 60px',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <T size={11} mono>{star}★</T>
                <div
                  style={{
                    height: 6,
                    background: 'hsl(var(--rt-border-subtle))',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: barColor,
                    }}
                  />
                </div>
                <T
                  size={10}
                  color="hsl(var(--rt-ink-60))"
                  mono
                  style={{ textAlign: 'right' }}
                >
                  {n} · {pctDisplay}%
                </T>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2 }} aria-label={`${value.toFixed(1)} из 5`}>
      {[1, 2, 3, 4, 5].map((s) => {
        const full = s <= Math.floor(value);
        const half = !full && value >= s - 0.5;
        const fill = full
          ? 'hsl(var(--rt-accent))'
          : half
            ? 'hsl(var(--rt-accent))'
            : 'hsl(var(--rt-border))';
        const opacity = half ? 0.5 : 1;
        return (
          <svg
            key={s}
            width={size}
            height={size}
            viewBox="0 0 20 20"
            fill={fill}
            style={{ opacity }}
            aria-hidden
          >
            <path d="M10 1 L12.5 7 L19 7.5 L14 12 L15.5 18.5 L10 15 L4.5 18.5 L6 12 L1 7.5 L7.5 7 Z" />
          </svg>
        );
      })}
    </div>
  );
}

function pluralReview(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'отзыв';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'отзыва';
  return 'отзывов';
}

function ReviewsTabs({
  tab,
  onTab,
  modelId,
  hideReadTab,
  onSubmitted,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  modelId: number;
  hideReadTab: boolean;
  onSubmitted: (r: RatingReview | null) => void;
}) {
  return (
    <div
      style={{
        padding: '22px 26px',
        border: '1px solid hsl(var(--rt-border-subtle))',
        borderRadius: 6,
        background: 'hsl(var(--rt-alt))',
      }}
    >
      {!hideReadTab && (
        <div
          role="tablist"
          aria-label="Отзывы"
          style={{
            display: 'flex',
            gap: 0,
            marginBottom: 20,
            borderBottom: '1px solid hsl(var(--rt-border-subtle))',
          }}
        >
          {(
            [
              ['read', 'Читать отзывы'],
              ['write', 'Оставить свой'],
            ] as const
          ).map(([k, label]) => {
            const active = tab === k;
            return (
              <button
                key={k}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => onTab(k)}
                style={{
                  padding: '10px 16px',
                  border: 0,
                  background: 'transparent',
                  borderBottom: active
                    ? '2px solid hsl(var(--rt-accent))'
                    : '2px solid transparent',
                  marginBottom: -1,
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  color: active ? 'hsl(var(--rt-ink))' : 'hsl(var(--rt-ink-60))',
                  cursor: 'pointer',
                  fontFamily: 'var(--rt-font-sans)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {tab === 'read' ? (
        <ReadTabInfo />
      ) : (
        <WriteForm modelId={modelId} onSubmitted={onSubmitted} />
      )}
    </div>
  );
}

function ReadTabInfo() {
  return (
    <div>
      <T size={11} color="hsl(var(--rt-ink-60))" style={{ lineHeight: 1.55, display: 'block', marginBottom: 14 }}>
        Сортировка:{' '}
        <span
          style={{
            color: 'hsl(var(--rt-ink))',
            fontWeight: 600,
            borderBottom: '1px solid hsl(var(--rt-ink))',
          }}
        >
          Новые
        </span>
      </T>
      <T size={11} color="hsl(var(--rt-ink-40))" style={{ lineHeight: 1.55, fontStyle: 'italic', display: 'block' }}>
        Отзывы публикуются после модерации. Поле «Полезно» появится позже.
      </T>
    </div>
  );
}

interface FormState {
  author_name: string;
  rating: number;
  pros: string;
  cons: string;
  comment: string;
  website: string;
}

const INITIAL_FORM: FormState = {
  author_name: '',
  rating: 0,
  pros: '',
  cons: '',
  comment: '',
  website: '',
};

function WriteForm({
  modelId,
  onSubmitted,
}: {
  modelId: number;
  onSubmitted: (r: RatingReview | null) => void;
}) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'submitting' }
    | { kind: 'success' }
    | { kind: 'error'; message: string; fields?: Record<string, string[]> }
  >({ kind: 'idle' });
  const [hoverRating, setHoverRating] = useState<number>(0);

  const isValid =
    form.author_name.trim().length > 0 &&
    form.rating >= 1 &&
    form.rating <= 5 &&
    form.comment.trim().length >= 10;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || status.kind === 'submitting') return;
    if (form.website.trim() !== '') {
      setStatus({
        kind: 'error',
        message: 'Отзыв помечен как спам. Обновите страницу и попробуйте снова.',
      });
      return;
    }
    setStatus({ kind: 'submitting' });
    try {
      const res = await fetch(
        `${reviewsApiBase()}/api/public/v1/rating/reviews/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelId,
            author_name: form.author_name.trim(),
            rating: form.rating,
            pros: form.pros.trim(),
            cons: form.cons.trim(),
            comment: form.comment.trim(),
            website: form.website,
          }),
        },
      );
      if (res.status === 201) {
        const created = (await res.json().catch(() => null)) as RatingReview | null;
        setStatus({ kind: 'success' });
        setForm(INITIAL_FORM);
        onSubmitted(created);
        return;
      }
      if (res.status === 429) {
        setStatus({
          kind: 'error',
          message: 'Слишком много отзывов подряд. Попробуйте позже.',
        });
        return;
      }
      if (res.status === 400) {
        const data = (await res.json().catch(() => ({}))) as Record<string, string[]>;
        setStatus({
          kind: 'error',
          message: 'Проверьте поля формы.',
          fields: data,
        });
        return;
      }
      setStatus({
        kind: 'error',
        message: `Не удалось отправить (HTTP ${res.status}).`,
      });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: 'Сетевая ошибка. Попробуйте ещё раз.',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <T size={11} color="hsl(var(--rt-ink-60))" style={{ lineHeight: 1.55, display: 'block', marginBottom: 16 }}>
        Оценка поможет другим выбрать модель. Обязательно: имя, оценка и комментарий от 10 символов.
      </T>

      <LabeledRow label="Ваше имя *">
        <input
          type="text"
          required
          maxLength={100}
          value={form.author_name}
          onChange={(e) => set('author_name', e.target.value)}
          style={inputStyle}
        />
      </LabeledRow>

      <Eyebrow>Ваша оценка *</Eyebrow>
      <div
        style={{ display: 'flex', gap: 4, marginTop: 8, marginBottom: 18 }}
        role="radiogroup"
        aria-label="Оценка"
      >
        {[1, 2, 3, 4, 5].map((s) => {
          const filled = s <= (hoverRating || form.rating);
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={form.rating === s}
              aria-label={`${s} звёзд`}
              onClick={() => set('rating', s)}
              onMouseEnter={() => setHoverRating(s)}
              onMouseLeave={() => setHoverRating(0)}
              style={{
                background: 'transparent',
                border: 0,
                padding: 0,
                cursor: 'pointer',
                color: 'hsl(var(--rt-accent))',
              }}
            >
              <svg
                width={28}
                height={28}
                viewBox="0 0 20 20"
                fill={filled ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth={1}
              >
                <path d="M10 1 L12.5 7 L19 7.5 L14 12 L15.5 18.5 L10 15 L4.5 18.5 L6 12 L1 7.5 L7.5 7 Z" />
              </svg>
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          marginBottom: 14,
        }}
      >
        <LabeledRow label="Плюсы">
          <textarea
            rows={3}
            maxLength={1000}
            value={form.pros}
            onChange={(e) => set('pros', e.target.value)}
            placeholder="Тихий, быстро греет…"
            style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }}
          />
        </LabeledRow>
        <LabeledRow label="Минусы">
          <textarea
            rows={3}
            maxLength={1000}
            value={form.cons}
            onChange={(e) => set('cons', e.target.value)}
            placeholder="Цена, Wi-Fi «забывает» сеть…"
            style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }}
          />
        </LabeledRow>
      </div>

      <LabeledRow label="Комментарий *">
        <textarea
          required
          rows={4}
          minLength={10}
          maxLength={5000}
          value={form.comment}
          onChange={(e) => set('comment', e.target.value)}
          placeholder="Расскажите, как модель показала себя в вашем доме…"
          style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
        />
      </LabeledRow>

      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={form.website}
        onChange={(e) => set('website', e.target.value)}
        style={{
          position: 'absolute',
          left: -9999,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
        aria-hidden
      />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          {status.kind === 'error' && (
            <T size={11} color="#b24a3b" style={{ display: 'block' }}>
              {status.message}
              {status.fields && (
                <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 11 }}>
                  {Object.entries(status.fields).map(([k, v]) => (
                    <li key={k}>
                      <strong>{k}:</strong> {Array.isArray(v) ? v.join(', ') : String(v)}
                    </li>
                  ))}
                </ul>
              )}
            </T>
          )}
          {status.kind === 'success' && (
            <T size={11} color="#1f8f4c" style={{ display: 'block' }}>
              Отзыв отправлен на модерацию. После проверки он появится в списке.
            </T>
          )}
        </div>
        <button
          type="submit"
          disabled={!isValid || status.kind === 'submitting'}
          style={{
            padding: '10px 22px',
            background: isValid ? 'hsl(var(--rt-accent))' : 'hsl(var(--rt-border))',
            color: 'hsl(var(--rt-accent-foreground, 0 0% 100%))',
            border: 0,
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            cursor: isValid && status.kind !== 'submitting' ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--rt-font-sans)',
          }}
        >
          {status.kind === 'submitting' ? 'Отправка…' : 'Опубликовать отзыв'}
        </button>
      </div>
    </form>
  );
}

function LabeledRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ marginBottom: 6 }}>
        <Eyebrow>{label}</Eyebrow>
      </div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid hsl(var(--rt-border))',
  borderRadius: 4,
  background: 'hsl(var(--rt-paper))',
  fontSize: 13,
  fontFamily: 'var(--rt-font-sans)',
  color: 'hsl(var(--rt-ink))',
  boxSizing: 'border-box',
};

function ReviewsList({ reviews }: { reviews: RatingReview[] }) {
  const [filter, setFilter] = useState<StarFilter>('all');
  const [sort, setSort] = useState<SortKey>('new');

  const filtered = useMemo(() => {
    const base = reviews.filter((r) => {
      if (filter === 'all') return true;
      if (filter === 5) return r.rating === 5;
      if (filter === 4) return r.rating >= 4;
      if (filter === 3) return r.rating <= 3;
      return true;
    });
    const sorted = [...base];
    sorted.sort((a, b) => {
      if (sort === 'rating_desc') return b.rating - a.rating;
      if (sort === 'rating_asc') return a.rating - b.rating;
      return +new Date(b.created_at) - +new Date(a.created_at);
    });
    return sorted;
  }, [reviews, filter, sort]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          paddingBottom: 16,
        }}
      >
        <Eyebrow>Фильтр:</Eyebrow>
        {(
          [
            ['all', 'Все'],
            [5, '5 ★'],
            [4, '4+ ★'],
            [3, '3 и ниже'],
          ] as const
        ).map(([key, label]) => {
          const active = filter === key;
          return (
            <button
              key={String(key)}
              type="button"
              onClick={() => setFilter(key)}
              style={{
                padding: '5px 10px',
                border: active
                  ? '1px solid hsl(var(--rt-ink))'
                  : '1px solid hsl(var(--rt-border))',
                borderRadius: 12,
                fontSize: 10,
                color: active ? 'hsl(var(--rt-paper))' : 'hsl(var(--rt-ink-60))',
                background: active ? 'hsl(var(--rt-ink))' : 'transparent',
                fontFamily: 'var(--rt-font-sans)',
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <Eyebrow>Сортировка:</Eyebrow>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          style={{
            padding: '5px 8px',
            fontSize: 11,
            border: '1px solid hsl(var(--rt-border))',
            borderRadius: 4,
            background: 'hsl(var(--rt-paper))',
            color: 'hsl(var(--rt-ink))',
            fontFamily: 'var(--rt-font-sans)',
          }}
        >
          <option value="new">Новые</option>
          <option value="rating_desc">По оценке ↓</option>
          <option value="rating_asc">По оценке ↑</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <T size={12} color="hsl(var(--rt-ink-60))">
          По выбранному фильтру отзывов нет.
        </T>
      ) : (
        <div
          className="rt-reviews-cards"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 20,
          }}
        >
          {filtered.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: RatingReview }) {
  const date = formatDate(review.created_at);
  const pros = review.pros
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const cons = review.cons
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <article
      style={{
        padding: '22px 24px',
        border: '1px solid hsl(var(--rt-border-subtle))',
        borderRadius: 6,
        background: 'hsl(var(--rt-paper))',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 10,
          gap: 12,
        }}
      >
        <div>
          <T size={13} weight={600} style={{ display: 'block' }}>
            {review.author_name || 'Аноним'}
          </T>
          <T size={10} color="hsl(var(--rt-ink-40))" mono style={{ marginTop: 3, display: 'block' }}>
            {date}
          </T>
        </div>
        <Stars value={review.rating} size={13} />
      </header>
      {(pros.length > 0 || cons.length > 0) && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 14,
            marginTop: 14,
          }}
        >
          {pros.length > 0 && (
            <ProsConsList kind="pros" items={pros} />
          )}
          {cons.length > 0 && (
            <ProsConsList kind="cons" items={cons} />
          )}
        </div>
      )}
      {review.comment && (
        <T size={12} style={{ lineHeight: 1.6, display: 'block' }}>
          {review.comment}
        </T>
      )}
    </article>
  );
}

function ProsConsList({
  kind,
  items,
}: {
  kind: 'pros' | 'cons';
  items: string[];
}) {
  const color = kind === 'pros' ? '#1f8f4c' : '#b24a3b';
  const label = kind === 'pros' ? 'Плюсы' : 'Минусы';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span
          aria-hidden
          style={{ width: 5, height: 5, borderRadius: '50%', background: color }}
        />
        <T
          size={10}
          color={color}
          mono
          style={{ textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}
        >
          {label}
        </T>
      </div>
      {items.map((p, i) => (
        <T
          key={i}
          size={11}
          style={{ lineHeight: 1.45, marginTop: i ? 4 : 0, display: 'block' }}
        >
          · {p}
        </T>
      ))}
    </div>
  );
}

function ReviewsSkeleton() {
  return (
    <div
      className="rt-reviews-cards"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 20,
      }}
      aria-busy="true"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            padding: '22px 24px',
            border: '1px solid hsl(var(--rt-border-subtle))',
            borderRadius: 6,
            background: 'hsl(var(--rt-paper))',
            minHeight: 140,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ height: 14, width: '40%', background: 'hsl(var(--rt-border-subtle))', borderRadius: 3 }} />
          <div style={{ height: 10, width: '30%', background: 'hsl(var(--rt-border-subtle))', borderRadius: 3 }} />
          <div style={{ height: 8, width: '100%', background: 'hsl(var(--rt-border-subtle))', borderRadius: 3, marginTop: 10 }} />
          <div style={{ height: 8, width: '90%', background: 'hsl(var(--rt-border-subtle))', borderRadius: 3 }} />
          <div style={{ height: 8, width: '70%', background: 'hsl(var(--rt-border-subtle))', borderRadius: 3 }} />
        </div>
      ))}
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}
