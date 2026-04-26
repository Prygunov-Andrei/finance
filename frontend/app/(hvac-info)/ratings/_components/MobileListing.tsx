'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type {
  RatingMethodology,
  RatingModelListItem,
} from '@/lib/api/types/rating';
import { BrandLogo, Eyebrow, H, T, formatPrice } from './primitives';
import RatingTabs, { useCurrentTab } from './RatingTabs';
import {
  useRatingFilters,
  type CapacityBucket,
} from './useRatingFilters';
import CustomRatingTab from './CustomRatingTab';

const PAGE_SIZE = 20;

const CAPACITY_OPTIONS: Array<{ id: CapacityBucket; label: string }> = [
  { id: 'any', label: 'Любая' },
  { id: 'lt3', label: 'До 3 кВт' },
  { id: '3to4', label: '3–4 кВт' },
  { id: 'gt4', label: 'От 4 кВт' },
];

export default function MobileListing({
  models,
  methodology,
}: {
  models: RatingModelListItem[];
  methodology: RatingMethodology;
}) {
  const tab = useCurrentTab();
  const filterState = useRatingFilters(models);
  const { filters, filtered } = filterState;
  const [drawer, setDrawer] = useState(false);

  const activeCount =
    filters.brands.length +
    (filters.priceMin != null ? 1 : 0) +
    (filters.priceMax != null ? 1 : 0);

  return (
    <>
      <MobileHero stats={methodology.stats} />
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'hsl(var(--rt-paper))',
        }}
      >
        <div
          style={{
            padding: '10px 18px 0',
            borderBottom: '1px solid hsl(var(--rt-border-subtle))',
          }}
        >
          <RatingTabs compact />
        </div>
        <FilterButtons
          activeCount={activeCount}
          totalCount={filtered.length}
          onOpen={() => setDrawer(true)}
        />
      </div>
      {tab === 'custom' ? (
        <CustomRatingTab models={filtered} methodology={methodology} variant="mobile" />
      ) : (
        <MobileRows models={filtered} mode={tab} />
      )}
      {drawer && <MobileFilterDrawer state={filterState} onClose={() => setDrawer(false)} />}
    </>
  );
}

function MobileHero({
  stats,
}: {
  stats: RatingMethodology['stats'];
}) {
  const numbers: Array<[number | string, string]> = [
    [stats.total_models, 'мод.'],
    [stats.active_criteria_count, 'крит.'],
    [4, 'года'],
  ];
  return (
    <section
      style={{
        padding: '18px 18px 16px',
        background: 'hsl(var(--rt-alt))',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <Eyebrow>Рейтинг · 04.2026</Eyebrow>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
          {numbers.map(([n, l]) => (
            <div key={l} style={{ display: 'flex', gap: 3, alignItems: 'baseline' }}>
              <span
                style={{
                  fontFamily: 'var(--rt-font-serif)',
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: -0.3,
                  color: 'hsl(var(--rt-ink))',
                }}
              >
                {n}
              </span>
              <span style={{ fontSize: 9, color: 'hsl(var(--rt-ink-60))' }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
      <H size={18} serif as="h1" style={{ letterSpacing: -0.3, lineHeight: 1.25 }}>
        Интегральный индекс «Август-климат» качества кондиционеров до 4,0 кВт.
      </H>
    </section>
  );
}

function FilterButtons({
  activeCount,
  totalCount,
  onOpen,
}: {
  activeCount: number;
  totalCount: number;
  onOpen: () => void;
}) {
  return (
    <div
      style={{
        padding: '10px 18px',
        display: 'flex',
        gap: 8,
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 32,
          padding: '0 12px',
          border: activeCount > 0
            ? '1px solid hsl(var(--rt-accent))'
            : '1px solid hsl(var(--rt-border))',
          background: 'hsl(var(--rt-paper))',
          borderRadius: 4,
          fontSize: 12,
          fontFamily: 'var(--rt-font-sans)',
          fontWeight: activeCount > 0 ? 600 : 500,
          color: activeCount > 0 ? 'hsl(var(--rt-ink))' : 'hsl(var(--rt-ink-60))',
          cursor: 'pointer',
        }}
      >
        Фильтры{activeCount > 0 && ` · ${activeCount}`}
        <span style={{ color: 'hsl(var(--rt-ink-40))', fontSize: 10 }}>▾</span>
      </button>
      <div style={{ flex: 1 }} />
      <T size={10} color="hsl(var(--rt-ink-60))">
        {totalCount} мод.
      </T>
    </div>
  );
}

function MobileRows({
  models,
  mode,
}: {
  models: RatingModelListItem[];
  mode: 'index' | 'silence';
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const sorted = useMemo(() => {
    if (mode === 'silence') {
      // Все модели в рейтинг, без замера — в конце.
      return models.slice().sort((a, b) => (b.noise_score ?? 0) - (a.noise_score ?? 0));
    }
    return models.slice().sort((a, b) => b.total_index - a.total_index);
  }, [models, mode]);
  const rows = sorted.slice(0, visible);
  const remaining = sorted.length - visible;

  if (sorted.length === 0) {
    return (
      <div style={{ padding: '40px 18px', textAlign: 'center' }}>
        <T size={13} color="hsl(var(--rt-ink-60))">
          Под фильтры ничего не подошло. Сбросьте выбор в панели фильтров.
        </T>
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: '4px 18px 0' }}>
        {rows.map((m, i) => {
          const rk = i + 1;
          const podium = rk <= 3;
          const open = i === openIdx;
          const value = mode === 'silence' ? m.noise_score ?? 0 : m.total_index;
          return (
            <div
              key={m.id}
              style={{ borderBottom: '1px solid hsl(var(--rt-border-subtle))' }}
            >
              <button
                type="button"
                onClick={() => setOpenIdx(open ? null : i)}
                aria-expanded={open}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 0,
                  padding: '14px 0',
                  display: 'grid',
                  gridTemplateColumns: '34px 1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    fontFamily: podium ? 'var(--rt-font-serif)' : 'var(--rt-font-mono)',
                    fontSize: podium ? 24 : 13,
                    color: podium
                      ? 'hsl(var(--rt-accent))'
                      : 'hsl(var(--rt-ink-40))',
                    fontWeight: podium ? 600 : 500,
                    letterSpacing: -0.4,
                    lineHeight: 1,
                  }}
                >
                  {rk}
                </span>
                <span style={{ minWidth: 0, display: 'block' }}>
                  <span style={{ marginBottom: 3, display: 'block' }}>
                    <BrandLogo
                      src={m.brand_logo}
                      srcDark={m.brand_logo_dark}
                      name={m.brand}
                      size={28}
                      tooltip={m.brand}
                    />
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'hsl(var(--rt-ink-60))',
                      lineHeight: 1.3,
                      display: 'block',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {m.inner_unit || m.series}
                  </span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span
                    title={
                      mode === 'silence'
                        ? 'Уровень шума, дБ(А)'
                        : 'Значение индекса «Август-климат»'
                    }
                    style={{
                      fontFamily: 'var(--rt-font-serif)',
                      fontSize: 16,
                      fontWeight: 600,
                      color: 'hsl(var(--rt-accent))',
                      letterSpacing: -0.2,
                      lineHeight: 1,
                      display: 'block',
                    }}
                  >
                    {value.toFixed(1)}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'hsl(var(--rt-ink-60))',
                      display: 'block',
                      marginTop: 4,
                    }}
                  >
                    {formatPrice(m.price)}
                  </span>
                </span>
              </button>
              {open && (
                <div
                  style={{
                    padding: '0 0 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <T size={12} color="hsl(var(--rt-ink-60))" style={{ lineHeight: 1.5 }}>
                    Бренд <span style={{ color: 'hsl(var(--rt-ink))', fontWeight: 600 }}>
                      {m.brand}
                    </span>{' '}
                    · серия{' '}
                    <span style={{ color: 'hsl(var(--rt-ink))' }}>
                      {m.series || '—'}
                    </span>
                  </T>
                  <Link
                    href={`/ratings/${m.slug}/`}
                    style={{
                      display: 'inline-flex',
                      justifyContent: 'center',
                      padding: '10px 14px',
                      background: 'hsl(var(--rt-ink))',
                      color: 'hsl(var(--rt-paper))',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Открыть модель →
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {remaining > 0 && (
        <div
          style={{
            padding: '18px',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            style={{
              padding: '10px 22px',
              background: 'transparent',
              border: '1px solid hsl(var(--rt-border))',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              color: 'hsl(var(--rt-ink))',
              cursor: 'pointer',
            }}
          >
            Показать ещё {Math.min(PAGE_SIZE, remaining)}
          </button>
        </div>
      )}
    </>
  );
}

function MobileFilterDrawer({
  state,
  onClose,
}: {
  state: ReturnType<typeof useRatingFilters>;
  onClose: () => void;
}) {
  const {
    filters,
    facets,
    setBrands,
    setRegions,
    setCapacity,
    setPriceMin,
    setPriceMax,
    resetAll,
  } = state;
  const fmt = (n: number | null) =>
    n == null ? '' : new Intl.NumberFormat('ru-RU').format(n);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'hsl(var(--rt-paper))',
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '8px 0 0', display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: 'hsl(var(--rt-ink-15))',
            }}
          />
        </div>
        <div
          style={{
            padding: '14px 18px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderBottom: '1px solid hsl(var(--rt-border-subtle))',
          }}
        >
          <div style={{ flex: 1 }}>
            <T size={14} weight={600}>
              Фильтры
            </T>
          </div>
          <button
            type="button"
            onClick={resetAll}
            style={{
              padding: '6px 10px',
              border: 0,
              background: 'transparent',
              fontSize: 12,
              color: 'hsl(var(--rt-ink-60))',
              cursor: 'pointer',
              textDecoration: 'underline',
              textDecorationColor: 'hsl(var(--rt-border))',
              textUnderlineOffset: 3,
            }}
          >
            Сбросить
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              background: 'hsl(var(--rt-accent))',
              color: 'hsl(var(--rt-paper))',
              border: 0,
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Готово
          </button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto' }}>
          <DrawerSection title="Цена">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="number"
                placeholder={
                  facets.priceMin != null ? `от ${fmt(facets.priceMin)}` : 'от'
                }
                value={filters.priceMin ?? ''}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setPriceMin(v ? Number(v) : null);
                }}
                style={drawerInputStyle}
              />
              <span style={{ color: 'hsl(var(--rt-ink-40))' }}>—</span>
              <input
                type="number"
                placeholder={
                  facets.priceMax != null ? `до ${fmt(facets.priceMax)}` : 'до'
                }
                value={filters.priceMax ?? ''}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setPriceMax(v ? Number(v) : null);
                }}
                style={drawerInputStyle}
              />
            </div>
          </DrawerSection>
          <DrawerSection title="Бренд">
            <ChipCheckList
              items={facets.brands.map((b) => ({ id: b, label: b }))}
              selected={filters.brands}
              onChange={setBrands}
            />
          </DrawerSection>
          {/* Region + Capacity фильтры убраны по решению 2026-04-22 */}
        </div>
      </div>
    </div>
  );
}

const drawerInputStyle: React.CSSProperties = {
  flex: 1,
  height: 36,
  padding: '0 10px',
  border: '1px solid hsl(var(--rt-border))',
  borderRadius: 4,
  background: 'hsl(var(--rt-paper))',
  fontFamily: 'var(--rt-font-mono)',
  fontSize: 12,
  color: 'hsl(var(--rt-ink))',
  outline: 'none',
};

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <Eyebrow style={{ display: 'block', marginBottom: 8 }}>{title}</Eyebrow>
      {children}
    </div>
  );
}

function ChipCheckList({
  items,
  selected,
  onChange,
}: {
  items: Array<{ id: string; label: string }>;
  selected: string[];
  onChange: (xs: string[]) => void;
}) {
  if (items.length === 0) {
    return (
      <T size={11} color="hsl(var(--rt-ink-60))">
        Нет данных
      </T>
    );
  }
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {items.map((it) => {
        const on = selected.includes(it.id);
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => toggle(it.id)}
            style={{
              padding: '6px 12px',
              borderRadius: 14,
              border: on
                ? '1px solid hsl(var(--rt-accent))'
                : '1px solid hsl(var(--rt-border))',
              background: on ? 'hsl(var(--rt-accent-bg))' : 'hsl(var(--rt-paper))',
              fontSize: 11,
              fontWeight: on ? 600 : 500,
              color: on ? 'hsl(var(--rt-accent))' : 'hsl(var(--rt-ink-60))',
              cursor: 'pointer',
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
