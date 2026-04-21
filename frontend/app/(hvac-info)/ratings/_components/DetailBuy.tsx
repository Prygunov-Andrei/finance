'use client';

import { useMemo, useState } from 'react';
import type {
  RatingModelDetail,
  RatingModelSupplier,
} from '@/lib/api/types/rating';
import { Eyebrow, H, T, formatPrice } from './primitives';
import {
  availabilityDotColor,
  cityCounts,
  computePriceStats,
  filterSuppliers,
  formatPriceShort,
  sortByPriceAsc,
  toNumber,
} from './buyHelpers';

type Props = { detail: RatingModelDetail };

const ALL_CITIES = '__all__';

export default function DetailBuy({ detail }: Props) {
  const suppliers = detail.suppliers ?? [];
  const cities = useMemo(() => cityCounts(suppliers), [suppliers]);
  const [cityFilter, setCityFilter] = useState<string>(ALL_CITIES);

  const priceStats = useMemo(() => computePriceStats(suppliers), [suppliers]);
  const visible = useMemo(() => {
    const filtered =
      cityFilter === ALL_CITIES
        ? suppliers
        : filterSuppliers(suppliers, { city: cityFilter });
    return sortByPriceAsc(filtered);
  }, [suppliers, cityFilter]);

  if (suppliers.length === 0) {
    return (
      <section
        data-anchor="buy"
        className="rt-detail-buy"
        style={{
          padding: '40px 40px',
          borderTop: '1px solid hsl(var(--rt-border-subtle))',
          background: 'hsl(var(--rt-alt))',
        }}
      >
        <Eyebrow>Где купить</Eyebrow>
        <H size={26} serif style={{ marginTop: 6 }}>
          Магазины пока не добавлены
        </H>
        <T
          size={13}
          color="hsl(var(--rt-ink-60))"
          style={{ marginTop: 10, display: 'block', lineHeight: 1.6 }}
        >
          Цены и предложения появятся, когда редактор добавит партнёров.
        </T>
      </section>
    );
  }

  return (
    <section
      data-anchor="buy"
      className="rt-detail-buy"
      style={{
        padding: '40px 40px',
        borderTop: '1px solid hsl(var(--rt-border-subtle))',
        background: 'hsl(var(--rt-alt))',
      }}
    >
      <header
        className="rt-buy-head"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 24,
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow>Где купить</Eyebrow>
          <H
            size={26}
            serif
            style={{
              marginTop: 6,
              letterSpacing: -0.3,
              textWrap: 'balance',
              maxWidth: 640,
            }}
          >
            {suppliers.length} {pluralShop(suppliers.length)}
            {cities.length > 0
              ? ` в ${cities.length} ${pluralCity(cities.length)}`
              : ''}
          </H>
        </div>
      </header>

      {priceStats.count >= 2 ? (
        <PriceStatbar stats={priceStats} />
      ) : (
        <div
          style={{
            padding: '14px 18px',
            background: 'hsl(var(--rt-paper))',
            border: '1px dashed hsl(var(--rt-border))',
            borderRadius: 6,
            marginBottom: 24,
          }}
        >
          <T size={12} color="hsl(var(--rt-ink-60))" style={{ lineHeight: 1.5 }}>
            Недостаточно данных для статистики. Цены уточняйте у магазинов.
          </T>
        </div>
      )}

      {priceStats.count >= 2 && (
        <PriceHistogram
          suppliers={suppliers}
          min={priceStats.min}
          max={priceStats.max}
          median={priceStats.median}
        />
      )}

      {cities.length > 0 && (
        <div
          className="rt-buy-filters"
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            marginBottom: 18,
            flexWrap: 'wrap',
          }}
        >
          <Eyebrow style={{ marginRight: 4 }}>Город:</Eyebrow>
          <div
            className="rt-buy-chips"
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              overflowX: 'visible',
            }}
          >
            <CityChip
              label={`Все города (${suppliers.length})`}
              active={cityFilter === ALL_CITIES}
              onClick={() => setCityFilter(ALL_CITIES)}
            />
            {cities.map((c) => (
              <CityChip
                key={c.city}
                label={`${c.city} (${c.count})`}
                active={cityFilter === c.city}
                onClick={() => setCityFilter(c.city)}
              />
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div
            className="rt-buy-sort"
            style={{ display: 'flex', gap: 10, alignItems: 'center' }}
          >
            <Eyebrow>Сортировка:</Eyebrow>
            <span
              style={{
                fontSize: 11,
                color: 'hsl(var(--rt-ink))',
                fontWeight: 600,
                borderBottom: '1px solid hsl(var(--rt-ink))',
                cursor: 'default',
              }}
            >
              Цена
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'hsl(var(--rt-ink-40))',
                fontWeight: 500,
                cursor: 'not-allowed',
              }}
              aria-disabled
            >
              Рейтинг магазина
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'hsl(var(--rt-ink-40))',
                fontWeight: 500,
                cursor: 'not-allowed',
              }}
              aria-disabled
            >
              Доставка
            </span>
          </div>
        </div>
      )}

      <SuppliersTable suppliers={visible} />
      <SuppliersCards suppliers={visible} />

      <style>{`
        @media (max-width: 899px) {
          .rt-detail-buy { padding: 28px 18px !important; }
          .rt-buy-statbar { grid-template-columns: 1fr 1fr !important; row-gap: 18px !important; }
          .rt-buy-statbar-cell { border-right: 0 !important; padding-left: 0 !important; }
          .rt-buy-chips { flex-wrap: nowrap !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch; padding-bottom: 6px; }
          .rt-buy-table { display: none !important; }
          .rt-buy-cards { display: flex !important; }
          .rt-buy-sort { display: none !important; }
        }
        @media (min-width: 900px) {
          .rt-buy-cards { display: none !important; }
        }
      `}</style>
    </section>
  );
}

function pluralShop(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'магазин';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'магазина';
  return 'магазинов';
}

function pluralCity(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'городе';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'городах';
  return 'городах';
}

function PriceStatbar({ stats }: { stats: ReturnType<typeof computePriceStats> }) {
  const items: Array<{ label: string; price: number; meta: string | null }> = [
    {
      label: 'Минимум',
      price: stats.min,
      meta: stats.minSupplier
        ? [stats.minSupplier.name, stats.minSupplier.city].filter(Boolean).join(', ')
        : null,
    },
    {
      label: 'Медиана',
      price: stats.median,
      meta: `по ${stats.count} ${pluralOffer(stats.count)}`,
    },
    { label: 'Средняя', price: stats.avg, meta: null },
    {
      label: 'Максимум',
      price: stats.max,
      meta: stats.maxSupplier
        ? [stats.maxSupplier.name, stats.maxSupplier.city].filter(Boolean).join(', ')
        : null,
    },
  ];
  return (
    <div
      className="rt-buy-statbar"
      style={{
        padding: '20px 24px',
        background: 'hsl(var(--rt-paper))',
        border: '1px solid hsl(var(--rt-border-subtle))',
        borderRadius: 6,
        marginBottom: 20,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 0,
      }}
    >
      {items.map((item, i) => (
        <div
          key={item.label}
          className="rt-buy-statbar-cell"
          style={{
            padding: '0 20px',
            borderRight: i < items.length - 1 ? '1px solid hsl(var(--rt-border-subtle))' : 0,
          }}
        >
          <Eyebrow>{item.label}</Eyebrow>
          <div
            style={{
              fontFamily: 'var(--rt-font-serif)',
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: -0.4,
              marginTop: 4,
              lineHeight: 1,
              color: 'hsl(var(--rt-ink))',
            }}
          >
            {formatPrice(item.price)}
          </div>
          {item.meta && (
            <T
              size={10}
              color="hsl(var(--rt-ink-60))"
              style={{ marginTop: 6, lineHeight: 1.4, display: 'block' }}
            >
              {item.meta}
            </T>
          )}
        </div>
      ))}
    </div>
  );
}

function pluralOffer(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'предложению';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
    return 'предложениям';
  return 'предложениям';
}

function PriceHistogram({
  suppliers,
  min,
  max,
  median,
}: {
  suppliers: RatingModelSupplier[];
  min: number;
  max: number;
  median: number;
}) {
  const prices = suppliers
    .map((s) => toNumber(s.price))
    .filter((n): n is number => n != null);
  const span = Math.max(max - min, 1);
  return (
    <div
      style={{
        marginBottom: 24,
        padding: '16px 24px',
        background: 'hsl(var(--rt-paper))',
        border: '1px solid hsl(var(--rt-border-subtle))',
        borderRadius: 6,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 12,
        }}
      >
        <Eyebrow>Разброс предложений</Eyebrow>
        <T size={10} color="hsl(var(--rt-ink-40))" mono>
          {formatPrice(min)} → {formatPrice(max)}
        </T>
      </div>
      <div style={{ position: 'relative', height: 36 }} aria-hidden>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            height: 1,
            background: 'hsl(var(--rt-border-subtle))',
          }}
        />
        {prices.map((p, i) => {
          const pct = ((p - min) / span) * 100;
          return (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${pct}%`,
                top: '50%',
                width: 10,
                height: 10,
                background: 'hsl(var(--rt-accent))',
                borderRadius: '50%',
                transform: 'translate(-50%,-50%)',
                border: '2px solid hsl(var(--rt-paper))',
                opacity: 0.85,
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 6,
          gap: 8,
        }}
      >
        <T size={9} color="hsl(var(--rt-ink-40))" mono>
          {formatPriceShort(min)}
        </T>
        <T size={9} color="hsl(var(--rt-ink-40))" mono>
          {formatPriceShort(median)} ◆ медиана
        </T>
        <T size={9} color="hsl(var(--rt-ink-40))" mono>
          {formatPriceShort(max)}
        </T>
      </div>
    </div>
  );
}

function CityChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px',
        border: active
          ? '1px solid hsl(var(--rt-ink))'
          : '1px solid hsl(var(--rt-border))',
        borderRadius: 14,
        fontSize: 11,
        color: active ? 'hsl(var(--rt-paper))' : 'hsl(var(--rt-ink-60))',
        fontFamily: 'var(--rt-font-sans)',
        fontWeight: active ? 600 : 500,
        background: active ? 'hsl(var(--rt-ink))' : 'transparent',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function SuppliersTable({ suppliers }: { suppliers: RatingModelSupplier[] }) {
  return (
    <div
      className="rt-buy-table"
      style={{
        background: 'hsl(var(--rt-paper))',
        border: '1px solid hsl(var(--rt-border-subtle))',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '3fr 1.3fr 1.6fr 1fr 100px 50px',
          padding: '10px 20px',
          background: 'hsl(var(--rt-alt))',
          borderBottom: '1px solid hsl(var(--rt-border-subtle))',
          gap: 14,
        }}
      >
        {['Магазин', 'Цена', 'Доставка', 'Наличие', 'Рейтинг', ''].map((h, i) => (
          <T key={i} size={9} color="hsl(var(--rt-ink-40))" mono style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}>
            {h}
          </T>
        ))}
      </div>
      {suppliers.map((s, i) => (
        <SupplierRow
          key={s.id}
          supplier={s}
          isLast={i === suppliers.length - 1}
        />
      ))}
      {suppliers.length === 0 && (
        <div style={{ padding: '24px 20px' }}>
          <T size={12} color="hsl(var(--rt-ink-60))">
            Для выбранного города предложений нет.
          </T>
        </div>
      )}
    </div>
  );
}

function SupplierRow({
  supplier,
  isLast,
}: {
  supplier: RatingModelSupplier;
  isLast: boolean;
}) {
  const dot = availabilityDotColor(supplier.availability);
  const price = toNumber(supplier.price);
  const rating = supplier.rating ? Number(supplier.rating) : null;
  const onClick = () => {
    if (!supplier.url) return;
    window.open(supplier.url, '_blank', 'noopener,noreferrer');
  };
  const firstLetter = supplier.name ? supplier.name.trim().charAt(0).toUpperCase() : '·';
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: '3fr 1.3fr 1.6fr 1fr 100px 50px',
        padding: '15px 20px',
        borderBottom: isLast ? 0 : '1px solid hsl(var(--rt-border-subtle))',
        gap: 14,
        alignItems: 'center',
        cursor: supplier.url ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div
          style={{
            width: 32,
            height: 32,
            background: 'hsl(var(--rt-chip))',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--rt-font-mono)',
            fontSize: 12,
            fontWeight: 600,
            color: 'hsl(var(--rt-ink-60))',
            flexShrink: 0,
          }}
          aria-hidden
        >
          {firstLetter}
        </div>
        <div style={{ minWidth: 0 }}>
          <T size={13} weight={600} style={{ display: 'block' }}>
            {supplier.name}
          </T>
          {supplier.city && (
            <T
              size={10}
              color="hsl(var(--rt-ink-40))"
              style={{ marginTop: 2, display: 'block' }}
            >
              {supplier.city}
            </T>
          )}
        </div>
      </div>
      <span
        style={{
          fontFamily: 'var(--rt-font-serif)',
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: -0.2,
          color: 'hsl(var(--rt-ink))',
        }}
      >
        {price != null ? formatPrice(price) : '—'}
      </span>
      <T size={11} color="hsl(var(--rt-ink-60))" style={{ lineHeight: 1.4 }}>
        {supplier.note || '—'}
      </T>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: dot,
            flexShrink: 0,
          }}
        />
        <T size={11}>{supplier.availability_display || '—'}</T>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        {rating != null ? (
          <>
            <span
              style={{
                fontFamily: 'var(--rt-font-serif)',
                fontSize: 13,
                fontWeight: 600,
                color: 'hsl(var(--rt-accent))',
              }}
            >
              {rating.toFixed(1)}
            </span>
            <T size={10} color="hsl(var(--rt-ink-40))" mono>
              /5
            </T>
          </>
        ) : (
          <T size={11} color="hsl(var(--rt-ink-40))">—</T>
        )}
      </div>
      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'hsl(var(--rt-ink-40))' }} aria-hidden>
        <path d="M7 4 L13 10 L7 16" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function SuppliersCards({ suppliers }: { suppliers: RatingModelSupplier[] }) {
  return (
    <div
      className="rt-buy-cards"
      style={{
        display: 'none',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {suppliers.map((s) => {
        const price = toNumber(s.price);
        const dot = availabilityDotColor(s.availability);
        return (
          <a
            key={s.id}
            href={s.url || '#'}
            target={s.url ? '_blank' : undefined}
            rel={s.url ? 'noopener noreferrer' : undefined}
            style={{
              padding: '14px 16px',
              border: '1px solid hsl(var(--rt-border-subtle))',
              borderRadius: 6,
              background: 'hsl(var(--rt-paper))',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <T size={13} weight={600}>{s.name}</T>
              <span
                style={{
                  fontFamily: 'var(--rt-font-serif)',
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: -0.2,
                  color: 'hsl(var(--rt-ink))',
                }}
              >
                {price != null ? formatPrice(price) : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {s.city && <T size={11} color="hsl(var(--rt-ink-60))">{s.city}</T>}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                <T size={11} color="hsl(var(--rt-ink-60))">{s.availability_display || '—'}</T>
              </span>
              {s.note && <T size={11} color="hsl(var(--rt-ink-40))">· {s.note}</T>}
            </div>
          </a>
        );
      })}
    </div>
  );
}
