'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import type {
  RatingMethodology,
  RatingModelListItem,
} from '@/lib/api/types/rating';
import { BrandLogo, Meter, T, formatPrice } from './primitives';
import RatingTabs, { useCurrentTab } from './RatingTabs';
import FilterBar from './FilterBar';
import { useRatingFilters } from './useRatingFilters';
import CustomRatingTab from './CustomRatingTab';

const PAGE_SIZE = 20;
const GRID = '56px 180px 60px 160px 1fr 140px 160px';

export default function DesktopListing({
  models,
  methodology,
}: {
  models: RatingModelListItem[];
  methodology: RatingMethodology;
}) {
  const tab = useCurrentTab();
  const {
    filters,
    facets,
    filtered,
    setBrands,
    setRegions,
    setCapacity,
    setPriceMin,
    setPriceMax,
    resetAll,
  } = useRatingFilters(models);

  return (
    <>
      <div style={{ padding: '20px 40px 0' }}>
        <RatingTabs />
      </div>
      <FilterBar
        filters={filters}
        facets={facets}
        setBrands={setBrands}
        setRegions={setRegions}
        setCapacity={setCapacity}
        setPriceMin={setPriceMin}
        setPriceMax={setPriceMax}
        resetAll={resetAll}
      />
      {tab === 'custom' ? (
        <CustomRatingTab models={filtered} methodology={methodology} variant="desktop" />
      ) : (
        <RankedTable models={filtered} mode={tab} />
      )}
    </>
  );
}

function RankedTable({
  models,
  mode,
}: {
  models: RatingModelListItem[];
  mode: 'index' | 'silence';
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sorted = useMemo(() => sortModels(models, mode), [models, mode]);
  const hiddenNoise =
    mode === 'silence' ? models.filter((m) => !m.has_noise_measurement).length : 0;
  const rows = sorted.slice(0, visible);
  const remaining = sorted.length - visible;

  return (
    <div style={{ padding: '8px 40px 0' }}>
      {mode === 'silence' && hiddenNoise > 0 && (
        <div
          style={{
            padding: '10px 0 14px',
            borderBottom: '1px solid hsl(var(--rt-border-subtle))',
          }}
        >
          <T size={11} color="hsl(var(--rt-ink-60))">
            Показаны {sorted.length} моделей с лабораторным замером шума. Ещё {hiddenNoise}{' '}
            {pluralModels(hiddenNoise)} без замера — добавятся после Ф7.
          </T>
        </div>
      )}
      {sorted.length === 0 && <EmptyState />}
      {rows.map((m, idx) => (
        <ModelRow key={m.id} model={m} position={idx + 1} mode={mode} />
      ))}
      {remaining > 0 && (
        <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            style={{
              padding: '10px 22px',
              background: 'transparent',
              border: '1px solid hsl(var(--rt-border))',
              borderRadius: 4,
              fontFamily: 'var(--rt-font-sans)',
              fontSize: 12,
              fontWeight: 500,
              color: 'hsl(var(--rt-ink))',
              cursor: 'pointer',
            }}
          >
            Показать ещё {Math.min(PAGE_SIZE, remaining)}{' '}
            {pluralModels(Math.min(PAGE_SIZE, remaining))}
          </button>
        </div>
      )}
    </div>
  );
}

function ModelRow({
  model,
  position,
  mode,
}: {
  model: RatingModelListItem;
  position: number;
  mode: 'index' | 'silence';
}) {
  const displayRank = mode === 'index' ? model.rank ?? position : position;
  const displayValue = mode === 'silence' ? model.noise_score ?? 0 : model.total_index;
  const href = `/ratings/${model.slug}/`;
  return (
    <Link
      href={href}
      style={{
        display: 'grid',
        gridTemplateColumns: GRID,
        padding: '18px 0',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
        alignItems: 'center',
        color: 'hsl(var(--rt-ink))',
        textDecoration: 'none',
        transition: 'background 0.15s',
      }}
      className="rt-row"
    >
      <div
        style={{
          fontFamily: 'var(--rt-font-mono)',
          fontSize: 14,
          color: 'hsl(var(--rt-ink-40))',
          fontWeight: 500,
          letterSpacing: -0.5,
        }}
      >
        {displayRank}
      </div>
      <div
        style={{
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BrandLogo src={model.brand_logo} name={model.brand} size={28} />
      </div>
      <div />
      <T size={13} weight={600} style={{ letterSpacing: -0.1 }}>
        {model.brand}
      </T>
      <InnerUnit>{model.inner_unit || model.series}</InnerUnit>
      <T size={13} weight={500}>
        {formatPrice(model.price)}
      </T>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Meter value={clamp01(displayValue, model.index_max)} />
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'hsl(var(--rt-accent))',
            fontFamily: 'var(--rt-font-serif)',
            letterSpacing: -0.2,
          }}
        >
          {displayValue.toFixed(1)}
        </span>
      </div>
    </Link>
  );
}

function InnerUnit({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 12,
        color: 'hsl(var(--rt-ink-60))',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        paddingRight: 12,
      }}
    >
      {children}
    </span>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center' }}>
      <T size={14} color="hsl(var(--rt-ink-60))">
        Под текущие фильтры ни одной модели не подходит. Попробуйте сбросить выбор.
      </T>
    </div>
  );
}

function clamp01(value: number, max: number): number {
  if (!max) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function pluralModels(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'модель';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'модели';
  return 'моделей';
}

function sortModels(
  models: RatingModelListItem[],
  mode: 'index' | 'silence'
): RatingModelListItem[] {
  if (mode === 'silence') {
    return models
      .filter((m) => m.has_noise_measurement && m.noise_score != null)
      .slice()
      .sort((a, b) => (b.noise_score ?? 0) - (a.noise_score ?? 0));
  }
  return models.slice().sort((a, b) => b.total_index - a.total_index);
}
