import type { CSSProperties } from 'react';
import type {
  RatingMethodologyStats,
  RatingModelDetail,
} from '@/lib/api/types/rating';
import { BrandLogo, Eyebrow, T, formatPrice } from './primitives';
import {
  fallbackLede,
  formatNominalCapacity,
  minSupplierPrice,
} from './detailHelpers';

type Props = {
  detail: RatingModelDetail;
  stats: RatingMethodologyStats;
  median: number;
};

export default function DetailHero({ detail, stats, median }: Props) {
  const lede = detail.editorial_lede?.trim() || fallbackLede(detail);
  const minPrice = minSupplierPrice(detail.suppliers);
  const suppliersCount = detail.suppliers.length;
  const rankText = detail.rank != null ? `№ ${detail.rank}` : '—';

  return (
    <section
      style={{
        background: 'hsl(var(--rt-alt))',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
      }}
      className="rt-detail-hero"
    >
      <div
        className="rt-detail-hero-inner"
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '44px 40px 40px',
        }}
      >
        {/* Desktop 2-col */}
        <div
          className="rt-hero-desktop"
          style={{
            display: 'none',
            gridTemplateColumns: '1.45fr 1fr',
            gap: 56,
            alignItems: 'start',
          }}
        >
          <HeroLeft detail={detail} lede={lede} />
          <HeroRight
            detail={detail}
            stats={stats}
            median={median}
            minPrice={minPrice}
            suppliersCount={suppliersCount}
            rankText={rankText}
          />
        </div>

        {/* Mobile stacked */}
        <div className="rt-hero-mobile" style={{ display: 'block' }}>
          <HeroMobile
            detail={detail}
            lede={lede}
            median={median}
            minPrice={minPrice}
            suppliersCount={suppliersCount}
          />
        </div>
      </div>

      <style>{`
        @media (min-width: 900px) {
          .rt-hero-desktop { display: grid !important; }
          .rt-hero-mobile { display: none !important; }
        }
        @media (max-width: 899px) {
          .rt-detail-hero-inner { padding: 20px 18px 22px !important; }
        }
      `}</style>
    </section>
  );
}

export function DetailHeroCollapsed({ detail, stats }: { detail: RatingModelDetail; stats: RatingMethodologyStats }) {
  const rankText = detail.rank != null ? `№ ${detail.rank}` : '—';
  return (
    <section
      style={{
        background: 'hsl(var(--rt-alt))',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '10px 40px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'nowrap',
          overflow: 'hidden',
        }}
        className="rt-detail-hero-collapsed-inner"
      >
        <BrandLogo
          src={detail.brand.logo}
          srcDark={detail.brand.logo_dark}
          name={detail.brand.name}
          size={28}
          tooltip={detail.brand.name}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'hsl(var(--rt-ink))',
            letterSpacing: -0.1,
            whiteSpace: 'nowrap',
          }}
        >
          {detail.brand.name}
        </span>
        <span
          style={{
            fontSize: 12,
            color: 'hsl(var(--rt-ink-60))',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
        >
          {detail.inner_unit || detail.series}
        </span>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--rt-font-serif)',
              fontSize: 18,
              fontWeight: 600,
              color: 'hsl(var(--rt-accent))',
              letterSpacing: -0.3,
            }}
          >
            {rankText}
          </span>
          <span
            style={{
              fontSize: 10,
              color: 'hsl(var(--rt-ink-60))',
              whiteSpace: 'nowrap',
            }}
          >
            из {stats.total_models}
          </span>
        </div>
        <span
          aria-hidden
          style={{
            width: 1,
            height: 16,
            background: 'hsl(var(--rt-border))',
            flexShrink: 0,
          }}
          className="rt-detail-collapsed-sep"
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 5,
            flexShrink: 0,
          }}
          className="rt-detail-collapsed-index"
        >
          <span
            style={{
              fontFamily: 'var(--rt-font-serif)',
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: -0.2,
              color: 'hsl(var(--rt-ink))',
            }}
          >
            {detail.total_index.toFixed(1)}
          </span>
          <span style={{ fontSize: 10, color: 'hsl(var(--rt-ink-60))' }}>
            индекс «Август-климат»
          </span>
        </div>
      </div>
      <style>{`
        @media (max-width: 600px) {
          .rt-detail-collapsed-sep,
          .rt-detail-collapsed-index { display: none !important; }
          .rt-detail-hero-collapsed-inner { padding: 10px 18px !important; }
        }
      `}</style>
    </section>
  );
}

function HeroLeft({
  detail,
  lede,
}: {
  detail: RatingModelDetail;
  lede: string;
}) {
  const seriesLabel = detail.series?.trim();
  const capacity = formatNominalCapacity(detail.nominal_capacity);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <BrandLogo
          src={detail.brand.logo}
          srcDark={detail.brand.logo_dark}
          name={detail.brand.name}
          size={64}
          tooltip={detail.brand.name}
        />
        {seriesLabel && (
          <>
            <span
              aria-hidden
              style={{ width: 1, height: 18, background: 'hsl(var(--rt-border))' }}
            />
            <MetaCell label="Серия" value={seriesLabel} />
          </>
        )}
        {detail.nominal_capacity != null && (
          <>
            <span
              aria-hidden
              style={{ width: 1, height: 18, background: 'hsl(var(--rt-border))' }}
            />
            <MetaCell label="Мощность охлаждения" value={capacity} />
          </>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          marginTop: 10,
        }}
      >
        <UnitCard
          label="Внутренний блок"
          code={detail.inner_unit}
          dimensions={detail.inner_unit_dimensions}
          weight={detail.inner_unit_weight_kg}
        />
        <UnitCard
          label="Наружный блок"
          code={detail.outer_unit}
          dimensions={detail.outer_unit_dimensions}
          weight={detail.outer_unit_weight_kg}
        />
      </div>

      <p
        style={{
          margin: '24px 0 0',
          fontSize: 15,
          color: 'hsl(var(--rt-ink-60))',
          maxWidth: 560,
          lineHeight: 1.55,
          textWrap: 'pretty',
        }}
      >
        {lede}
      </p>
    </div>
  );
}

function HeroRight({
  detail,
  stats,
  median,
  minPrice,
  suppliersCount,
  rankText,
}: {
  detail: RatingModelDetail;
  stats: RatingMethodologyStats;
  median: number;
  minPrice: number | null;
  suppliersCount: number;
  rankText: string;
}) {
  const priceLine =
    suppliersCount === 0
      ? 'магазины скоро появятся'
      : minPrice != null
      ? `розница от ${formatPrice(minPrice)} · ${suppliersCount} ${pluralShops(suppliersCount)}`
      : `${suppliersCount} ${pluralShops(suppliersCount)}, цены уточняйте`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        paddingLeft: 28,
        borderLeft: '1px solid hsl(var(--rt-border-subtle))',
      }}
    >
      <div style={{ padding: '4px 0 20px' }}>
        <Eyebrow>Позиция в рейтинге</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
          <span
            style={{
              fontFamily: 'var(--rt-font-serif)',
              fontSize: 72,
              fontWeight: 600,
              lineHeight: 0.9,
              letterSpacing: -3,
              color: 'hsl(var(--rt-accent))',
            }}
          >
            {rankText}
          </span>
          <span style={{ fontSize: 13, color: 'hsl(var(--rt-ink-60))' }}>
            из {stats.total_models} моделей
          </span>
        </div>
        <div
          aria-hidden
          style={{
            height: 3,
            width: 64,
            background: 'hsl(var(--rt-accent))',
            marginTop: 12,
          }}
        />
      </div>

      <div
        style={{
          padding: '16px 0',
          borderTop: '1px solid hsl(var(--rt-border-subtle))',
        }}
      >
        <Eyebrow>Индекс «Август-климат»</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
          <span
            style={{
              fontFamily: 'var(--rt-font-serif)',
              fontSize: 36,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: -0.8,
              color: 'hsl(var(--rt-ink))',
            }}
          >
            {detail.total_index.toFixed(1)}
          </span>
          <span style={{ fontSize: 12, color: 'hsl(var(--rt-ink-60))' }}>
            / 100 · медиана {median.toFixed(1)}
          </span>
        </div>
      </div>

      <div
        style={{
          padding: '16px 0',
          borderTop: '1px solid hsl(var(--rt-border-subtle))',
        }}
      >
        <Eyebrow>Рекомендованная цена</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
          <span
            style={{
              fontFamily: 'var(--rt-font-serif)',
              fontSize: 30,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: -0.5,
              color: 'hsl(var(--rt-ink))',
            }}
          >
            {formatPrice(detail.price)}
          </span>
        </div>
        <T
          size={11}
          color="hsl(var(--rt-ink-60))"
          style={{ marginTop: 6, display: 'block' }}
        >
          {priceLine}
        </T>
      </div>
    </div>
  );
}

function HeroMobile({
  detail,
  lede,
  median,
  minPrice,
  suppliersCount,
}: {
  detail: RatingModelDetail;
  lede: string;
  median: number;
  minPrice: number | null;
  suppliersCount: number;
}) {
  const seriesLabel = detail.series?.trim();
  const capacity = formatNominalCapacity(detail.nominal_capacity);
  const rankBadge = detail.rank != null ? `#${detail.rank}` : '—';
  const priceMeta =
    suppliersCount === 0
      ? 'скоро магазины'
      : minPrice != null
      ? `${suppliersCount} ${pluralShops(suppliersCount)}`
      : `${suppliersCount} ${pluralShops(suppliersCount)}`;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 12,
        }}
      >
        <BrandLogo
          src={detail.brand.logo}
          srcDark={detail.brand.logo_dark}
          name={detail.brand.name}
          size={44}
          tooltip={detail.brand.name}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'hsl(var(--rt-accent-bg))',
            padding: '5px 10px',
            borderRadius: 4,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--rt-font-mono)',
              fontSize: 9,
              color: 'hsl(var(--rt-accent))',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Ранг
          </span>
          <span
            style={{
              fontFamily: 'var(--rt-font-serif)',
              fontSize: 16,
              fontWeight: 600,
              color: 'hsl(var(--rt-accent))',
              lineHeight: 1,
            }}
          >
            {rankBadge}
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          marginBottom: 14,
          paddingBottom: 14,
          borderBottom: '1px solid hsl(var(--rt-border-subtle))',
        }}
      >
        {seriesLabel && (
          <div style={{ flex: 1 }}>
            <MobileMetaLabel>Серия</MobileMetaLabel>
            <T size={12} weight={600} style={{ marginTop: 4, display: 'block' }}>
              {seriesLabel}
            </T>
          </div>
        )}
        {detail.nominal_capacity != null && (
          <>
            {seriesLabel && (
              <span
                aria-hidden
                style={{ width: 1, height: 30, background: 'hsl(var(--rt-border))' }}
              />
            )}
            <div style={{ flex: 1.2 }}>
              <MobileMetaLabel>Мощность охл.</MobileMetaLabel>
              <T size={12} weight={600} style={{ marginTop: 4, display: 'block' }}>
                {capacity}
              </T>
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <UnitCard
          label="Внутренний блок"
          code={detail.inner_unit}
          dimensions={detail.inner_unit_dimensions}
          weight={detail.inner_unit_weight_kg}
          compact
        />
        <UnitCard
          label="Наружный блок"
          code={detail.outer_unit}
          dimensions={detail.outer_unit_dimensions}
          weight={detail.outer_unit_weight_kg}
          compact
        />
      </div>

      <p
        style={{
          margin: '16px 0 0',
          fontSize: 13,
          color: 'hsl(var(--rt-ink-80))',
          lineHeight: 1.55,
        }}
      >
        {lede}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 10,
          marginTop: 18,
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            border: '1px solid hsl(var(--rt-accent))',
            borderRadius: 6,
            background: 'hsl(var(--rt-accent-bg))',
          }}
        >
          <MobileMetaLabel color="hsl(var(--rt-accent))">
            Индекс «Август-климат»
          </MobileMetaLabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
            <span
              style={{
                fontFamily: 'var(--rt-font-serif)',
                fontSize: 36,
                fontWeight: 700,
                color: 'hsl(var(--rt-accent))',
                letterSpacing: -0.8,
                lineHeight: 1,
              }}
            >
              {detail.total_index.toFixed(1)}
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'hsl(var(--rt-accent))',
                opacity: 0.7,
              }}
            >
              /100
            </span>
          </div>
          <T
            size={10}
            color="hsl(var(--rt-accent))"
            style={{ marginTop: 4, opacity: 0.85, display: 'block' }}
          >
            медиана {median.toFixed(1)}
          </T>
        </div>
        <div
          style={{
            padding: '14px 16px',
            border: '1px solid hsl(var(--rt-border-subtle))',
            borderRadius: 6,
            background: 'hsl(var(--rt-paper))',
          }}
        >
          <MobileMetaLabel>От</MobileMetaLabel>
          <div
            style={{
              fontFamily: 'var(--rt-font-serif)',
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: -0.3,
              marginTop: 6,
              lineHeight: 1,
              color: 'hsl(var(--rt-ink))',
            }}
          >
            {formatPrice(minPrice ?? detail.price)}
          </div>
          <T
            size={10}
            color="hsl(var(--rt-ink-60))"
            style={{ marginTop: 4, display: 'block' }}
          >
            {priceMeta}
          </T>
        </div>
      </div>
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <T
        size={10}
        color="hsl(var(--rt-ink-40))"
        mono
        style={{
          textTransform: 'uppercase',
          letterSpacing: 1,
          lineHeight: 1,
          display: 'block',
        }}
      >
        {label}
      </T>
      <T size={13} weight={600} style={{ marginTop: 3, display: 'block' }}>
        {value}
      </T>
    </div>
  );
}

function MobileMetaLabel({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      style={{
        fontFamily: 'var(--rt-font-mono)',
        fontSize: 9,
        color: color ?? 'hsl(var(--rt-ink-40))',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 1,
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

function UnitCard({
  label,
  code,
  dimensions,
  weight,
  compact = false,
}: {
  label: string;
  code: string;
  dimensions: string;
  weight: string | null;
  compact?: boolean;
}) {
  const subline = buildSubline(dimensions, weight);
  const cardStyle: CSSProperties = {
    padding: compact ? '12px 14px' : '18px 20px',
    border: '1px solid hsl(var(--rt-border-subtle))',
    borderRadius: 6,
    background: 'hsl(var(--rt-paper))',
  };
  return (
    <div style={cardStyle}>
      <T
        size={compact ? 9 : 10}
        color="hsl(var(--rt-ink-40))"
        mono
        style={{
          textTransform: 'uppercase',
          letterSpacing: 1,
          display: 'block',
        }}
      >
        {label}
      </T>
      <div
        style={{
          fontFamily: 'var(--rt-font-mono)',
          fontSize: compact ? 18 : 24,
          fontWeight: 600,
          letterSpacing: compact ? -0.2 : -0.3,
          marginTop: compact ? 4 : 8,
          lineHeight: 1.1,
          color: 'hsl(var(--rt-ink))',
          wordBreak: 'break-all',
        }}
      >
        {code || '—'}
      </div>
      {subline && (
        <T
          size={compact ? 10 : 11}
          color="hsl(var(--rt-ink-60))"
          style={{ marginTop: compact ? 4 : 10, display: 'block' }}
        >
          {subline}
        </T>
      )}
    </div>
  );
}

function buildSubline(dimensions: string, weight: string | null): string {
  const parts: string[] = [];
  const d = dimensions?.trim();
  if (d) parts.push(d);
  if (weight) {
    const n = Number(weight);
    if (Number.isFinite(n) && n > 0) {
      parts.push(`${n} кг`);
    }
  }
  return parts.join(' · ');
}

function pluralShops(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'магазинов';
  if (mod10 === 1) return 'магазин';
  if (mod10 >= 2 && mod10 <= 4) return 'магазина';
  return 'магазинов';
}
