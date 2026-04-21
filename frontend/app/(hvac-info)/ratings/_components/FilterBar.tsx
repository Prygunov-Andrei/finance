'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { T } from './primitives';
import type { CapacityBucket, RatingFacets, RatingFilters } from './useRatingFilters';

const CAPACITY_LABELS: Record<CapacityBucket, string> = {
  any: 'Любая',
  lt3: 'До 3 кВт',
  '3to4': '3–4 кВт',
  gt4: 'От 4 кВт',
};

interface FilterBarProps {
  filters: RatingFilters;
  facets: RatingFacets;
  setBrands: (xs: string[]) => void;
  setRegions: (xs: string[]) => void;
  setCapacity: (c: CapacityBucket) => void;
  setPriceMin: (n: number | null) => void;
  setPriceMax: (n: number | null) => void;
  resetAll: () => void;
}

export default function FilterBar(props: FilterBarProps) {
  const {
    filters,
    facets,
    setBrands,
    setRegions,
    setCapacity,
    setPriceMin,
    setPriceMax,
    resetAll,
  } = props;
  const hasActive =
    filters.brands.length > 0 ||
    filters.regions.length > 0 ||
    filters.capacity !== 'any' ||
    filters.priceMin != null ||
    filters.priceMax != null;

  return (
    <div
      style={{
        padding: '16px 40px',
        display: 'flex',
        gap: 10,
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <BrandDropdown brands={facets.brands} selected={filters.brands} onChange={setBrands} />
      <PriceRange
        placeholderMin={facets.priceMin}
        placeholderMax={facets.priceMax}
        valueMin={filters.priceMin}
        valueMax={filters.priceMax}
        onMin={setPriceMin}
        onMax={setPriceMax}
      />
      <RegionDropdown
        regions={facets.regions}
        selected={filters.regions}
        onChange={setRegions}
      />
      <CapacityDropdown value={filters.capacity} onChange={setCapacity} />
      {hasActive && (
        <button
          type="button"
          onClick={resetAll}
          style={{
            height: 34,
            padding: '0 10px',
            border: 0,
            background: 'transparent',
            color: 'hsl(var(--rt-ink-60))',
            fontSize: 11,
            fontFamily: 'var(--rt-font-sans)',
            cursor: 'pointer',
            textDecoration: 'underline',
            textDecorationColor: 'hsl(var(--rt-border))',
            textUnderlineOffset: 3,
          }}
        >
          Сбросить
        </button>
      )}
      <div style={{ flex: 1 }} />
      <Link
        href="/ratings/submit/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 18px',
          height: 34,
          background: 'hsl(var(--rt-ink))',
          color: 'hsl(var(--rt-paper))',
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 4,
          textDecoration: 'none',
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
        Добавить модель
      </Link>
    </div>
  );
}

// ─── Popover shell ──────────────────────────────────────────

function Popover({
  label,
  summary,
  width = 180,
  children,
  active = false,
}: {
  label: string;
  summary: ReactNode;
  width?: number;
  active?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const trigger: CSSProperties = {
    width,
    height: 34,
    padding: '0 12px',
    border: active
      ? '1px solid hsl(var(--rt-accent))'
      : '1px solid hsl(var(--rt-border))',
    background: 'hsl(var(--rt-paper))',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 12,
    color: active ? 'hsl(var(--rt-ink))' : 'hsl(var(--rt-ink-60))',
    fontFamily: 'var(--rt-font-sans)',
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
  };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        style={trigger}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary}
        </span>
        <span style={{ color: 'hsl(var(--rt-ink-40))', fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: width,
            maxWidth: 320,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'hsl(var(--rt-paper))',
            border: '1px solid hsl(var(--rt-border))',
            borderRadius: 4,
            boxShadow: '0 6px 24px hsl(var(--rt-ink-15))',
            zIndex: 30,
            padding: 6,
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// ─── Individual dropdowns ──────────────────────────────────

function BrandDropdown({
  brands,
  selected,
  onChange,
}: {
  brands: string[];
  selected: string[];
  onChange: (xs: string[]) => void;
}) {
  const summary =
    selected.length === 0
      ? 'Бренд · все'
      : selected.length === 1
      ? `Бренд · ${selected[0]}`
      : `Бренд · ${selected.length}`;
  const toggle = (b: string) => {
    if (selected.includes(b)) onChange(selected.filter((x) => x !== b));
    else onChange([...selected, b]);
  };
  return (
    <Popover label="Бренд" summary={summary} width={180} active={selected.length > 0}>
      {() => (
        <>
          {brands.length === 0 && (
            <div style={{ padding: 8 }}>
              <T size={11} color="hsl(var(--rt-ink-60))">
                Нет данных
              </T>
            </div>
          )}
          {brands.map((b) => (
            <CheckRow key={b} checked={selected.includes(b)} onToggle={() => toggle(b)}>
              {b}
            </CheckRow>
          ))}
        </>
      )}
    </Popover>
  );
}

function RegionDropdown({
  regions,
  selected,
  onChange,
}: {
  regions: Array<{ code: string; label: string }>;
  selected: string[];
  onChange: (xs: string[]) => void;
}) {
  const summary =
    selected.length === 0
      ? 'Регион · все'
      : selected.length === 1
      ? `Регион · ${regions.find((r) => r.code === selected[0])?.label ?? selected[0]}`
      : `Регион · ${selected.length}`;
  const toggle = (code: string) => {
    if (selected.includes(code)) onChange(selected.filter((x) => x !== code));
    else onChange([...selected, code]);
  };
  return (
    <Popover label="Регион" summary={summary} width={180} active={selected.length > 0}>
      {() => (
        <>
          {regions.length === 0 && (
            <div style={{ padding: 8 }}>
              <T size={11} color="hsl(var(--rt-ink-60))">
                Нет данных
              </T>
            </div>
          )}
          {regions.map((r) => (
            <CheckRow
              key={r.code}
              checked={selected.includes(r.code)}
              onToggle={() => toggle(r.code)}
            >
              {r.label}
            </CheckRow>
          ))}
        </>
      )}
    </Popover>
  );
}

function CapacityDropdown({
  value,
  onChange,
}: {
  value: CapacityBucket;
  onChange: (c: CapacityBucket) => void;
}) {
  const summary = value === 'any' ? 'Мощность · любая' : `Мощность · ${CAPACITY_LABELS[value]}`;
  const options: CapacityBucket[] = ['any', 'lt3', '3to4', 'gt4'];
  return (
    <Popover label="Мощность" summary={summary} width={170} active={value !== 'any'}>
      {(close) => (
        <>
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
                close();
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                border: 0,
                background: value === opt ? 'hsl(var(--rt-accent-bg))' : 'transparent',
                color: value === opt ? 'hsl(var(--rt-accent))' : 'hsl(var(--rt-ink))',
                fontSize: 12,
                fontFamily: 'var(--rt-font-sans)',
                fontWeight: value === opt ? 600 : 500,
                borderRadius: 3,
                cursor: 'pointer',
              }}
            >
              {CAPACITY_LABELS[opt]}
            </button>
          ))}
        </>
      )}
    </Popover>
  );
}

function CheckRow({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 8px',
        cursor: 'pointer',
        borderRadius: 3,
        fontSize: 12,
        color: 'hsl(var(--rt-ink))',
        fontFamily: 'var(--rt-font-sans)',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        style={{ accentColor: 'hsl(var(--rt-accent))' }}
      />
      <span>{children}</span>
    </label>
  );
}

function PriceRange({
  placeholderMin,
  placeholderMax,
  valueMin,
  valueMax,
  onMin,
  onMax,
}: {
  placeholderMin: number | null;
  placeholderMax: number | null;
  valueMin: number | null;
  valueMax: number | null;
  onMin: (n: number | null) => void;
  onMax: (n: number | null) => void;
}) {
  const fmt = (n: number | null) =>
    n == null ? '' : new Intl.NumberFormat('ru-RU').format(n);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <PriceInput
        label="Цена от"
        placeholder={placeholderMin != null ? `${fmt(placeholderMin)} ₽` : ''}
        value={valueMin}
        onChange={onMin}
        active={valueMin != null}
      />
      <span style={{ color: 'hsl(var(--rt-ink-40))', fontSize: 12 }}>—</span>
      <PriceInput
        label="Цена до"
        placeholder={placeholderMax != null ? `${fmt(placeholderMax)} ₽` : ''}
        value={valueMax}
        onChange={onMax}
        active={valueMax != null}
      />
    </div>
  );
}

function PriceInput({
  label,
  placeholder,
  value,
  onChange,
  active,
}: {
  label: string;
  placeholder: string;
  value: number | null;
  onChange: (n: number | null) => void;
  active: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
        height: 34,
        border: active
          ? '1px solid hsl(var(--rt-accent))'
          : '1px solid hsl(var(--rt-border))',
        borderRadius: 4,
        background: 'hsl(var(--rt-paper))',
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontFamily: 'var(--rt-font-mono)',
          color: 'hsl(var(--rt-ink-40))',
          textTransform: 'uppercase',
          letterSpacing: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (!raw) {
            onChange(null);
            return;
          }
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : null);
        }}
        style={{
          width: 96,
          border: 0,
          background: 'transparent',
          fontFamily: 'var(--rt-font-mono)',
          fontSize: 12,
          fontWeight: 600,
          color: 'hsl(var(--rt-ink))',
          outline: 'none',
          padding: 0,
        }}
      />
    </div>
  );
}
