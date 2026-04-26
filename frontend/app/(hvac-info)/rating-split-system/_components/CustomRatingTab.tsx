'use client';

import Link from 'next/link';
import {
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type {
  RatingMethodology,
  RatingMethodologyCriterion,
  RatingModelListItem,
} from '@/lib/api/types/rating';
import { BrandLogo, Eyebrow, Meter, T, formatPrice } from './primitives';
import { useFlip } from './useFlip';
import {
  AD_BADGE_BACKGROUND,
  AD_ROW_BACKGROUND,
  applyAdPositioning,
  type WithDisplayRank,
} from './ratingDisplay';

const PAGE_SIZE = 20;
const TABLE_GRID = '56px 180px 40px 160px 1fr 120px 130px 160px';

export default function CustomRatingTab({
  models,
  methodology,
  variant = 'desktop',
  initialPresetSlug,
}: {
  models: RatingModelListItem[];
  methodology: RatingMethodology;
  variant?: 'desktop' | 'mobile';
  initialPresetSlug?: string;
}) {
  const criteria = useMemo(
    () => [...methodology.criteria].sort((a, b) => b.weight - a.weight),
    [methodology.criteria]
  );
  const allCodes = useMemo(() => criteria.map((c) => c.code), [criteria]);
  const presetDefs = useMemo<PresetDef[]>(
    () =>
      [...methodology.presets]
        .sort((a, b) => a.order - b.order)
        .map((p) => ({ id: p.slug, label: p.label, codes: p.criteria_codes })),
    [methodology.presets]
  );

  const [active, setActive] = useState<Set<string>>(() => {
    if (initialPresetSlug) {
      const preset = methodology.presets.find((p) => p.slug === initialPresetSlug);
      if (preset) return new Set(preset.criteria_codes);
    }
    return new Set(allCodes);
  });
  const [expanded, setExpanded] = useState(variant === 'desktop');
  const [drawer, setDrawer] = useState(false);

  const totalWeight = useMemo(
    () => criteria.reduce((s, c) => s + c.weight, 0),
    [criteria]
  );
  const activeWeight = useMemo(
    () => criteria.reduce((s, c) => (active.has(c.code) ? s + c.weight : s), 0),
    [criteria, active]
  );
  const currentPreset = useMemo(
    () => detectPreset(active, presetDefs),
    [active, presetDefs]
  );

  const toggle = (code: string) => {
    const next = new Set(active);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setActive(next);
  };
  const applyPreset = (codes: string[]) => setActive(new Set(codes));
  const setAll = () => setActive(new Set(allCodes));
  const setNone = () => setActive(new Set());

  const summary = (
    <SummaryBar
      activeCount={active.size}
      totalCount={allCodes.length}
      activeWeight={activeWeight}
      totalWeight={totalWeight}
      presets={presetDefs}
      currentPreset={currentPreset}
      onApplyPreset={applyPreset}
      expanded={expanded}
      onToggleExpanded={() => setExpanded((v) => !v)}
      onOpenDrawer={() => setDrawer(true)}
      variant={variant}
    />
  );

  const criteriaDrawerInline =
    variant === 'desktop' && expanded ? (
      <CriteriaDrawer
        criteria={criteria}
        active={active}
        onToggle={toggle}
        onSetAll={setAll}
        onSetNone={setNone}
        columns={3}
      />
    ) : null;

  return (
    <>
      {summary}
      {criteriaDrawerInline}
      {variant === 'desktop' ? (
        <DesktopCustomTable
          criteria={criteria}
          allCodes={allCodes}
          active={active}
          models={models}
        />
      ) : (
        <MobileCustomList
          criteria={criteria}
          allCodes={allCodes}
          active={active}
          models={models}
        />
      )}
      {variant === 'mobile' && drawer && (
        <MobileCriteriaSheet
          criteria={criteria}
          active={active}
          activeCount={active.size}
          activeWeight={activeWeight}
          onToggle={toggle}
          onSetAll={setAll}
          onSetNone={setNone}
          presets={presetDefs}
          currentPreset={currentPreset}
          onApplyPreset={applyPreset}
          onClose={() => setDrawer(false)}
        />
      )}
    </>
  );
}

// ─── Summary bar ─────────────────────────────────────────────

function SummaryBar({
  activeCount,
  totalCount,
  activeWeight,
  totalWeight,
  presets,
  currentPreset,
  onApplyPreset,
  expanded,
  onToggleExpanded,
  onOpenDrawer,
  variant,
}: {
  activeCount: number;
  totalCount: number;
  activeWeight: number;
  totalWeight: number;
  presets: PresetDef[];
  currentPreset: string | null;
  onApplyPreset: (codes: string[]) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenDrawer: () => void;
  variant: 'desktop' | 'mobile';
}) {
  const pct = totalWeight === 0 ? 0 : (activeWeight / totalWeight) * 100;

  if (variant === 'mobile') {
    return (
      <>
        <div
          style={{
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderBottom: '1px solid hsl(var(--rt-border-subtle))',
            background: 'hsl(var(--rt-alt))',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontFamily: 'var(--rt-font-mono)', fontSize: 13, fontWeight: 700 }}>
                {activeCount}
                <span style={{ color: 'hsl(var(--rt-ink-40))', fontWeight: 500 }}>
                  /{totalCount}
                </span>
              </span>
              <Eyebrow>критериев · {activeWeight}%</Eyebrow>
            </div>
            <ProgressBar pct={pct} />
          </div>
          <button
            type="button"
            onClick={onOpenDrawer}
            style={{
              padding: '8px 14px',
              background: 'hsl(var(--rt-ink))',
              color: 'hsl(var(--rt-paper))',
              border: 0,
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Настроить ▾
          </button>
        </div>
        <PresetRow
          presets={presets}
          currentPreset={currentPreset}
          onApply={onApplyPreset}
          padding="10px 18px"
          scroll
        />
      </>
    );
  }

  return (
    <div
      style={{
        padding: '14px 40px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
        background: 'hsl(var(--rt-alt))',
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 12px',
          background: 'hsl(var(--rt-paper))',
          border: '1px solid hsl(var(--rt-border))',
          borderRadius: 4,
        }}
      >
        <Eyebrow>Критериев</Eyebrow>
        <span style={{ fontFamily: 'var(--rt-font-mono)', fontSize: 14, fontWeight: 700 }}>
          {activeCount}
          <span style={{ color: 'hsl(var(--rt-ink-40))', fontWeight: 500 }}>/{totalCount}</span>
        </span>
      </div>
      <div style={{ flex: '0 0 140px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <ProgressBar pct={pct} />
        <T size={10} color="hsl(var(--rt-ink-40))" mono>
          вес: {activeWeight}% из {totalWeight}%
        </T>
      </div>
      <Eyebrow>Пресет:</Eyebrow>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {presets.map((p) => (
          <PresetChip
            key={p.id}
            active={currentPreset === p.id}
            onClick={() => onApplyPreset(p.codes)}
          >
            {p.label}
          </PresetChip>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        onClick={onToggleExpanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 14px',
          background: expanded ? 'hsl(var(--rt-ink))' : 'hsl(var(--rt-paper))',
          color: expanded ? 'hsl(var(--rt-paper))' : 'hsl(var(--rt-ink))',
          border: expanded
            ? '1px solid hsl(var(--rt-ink))'
            : '1px solid hsl(var(--rt-border))',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Настроить критерии
        <span
          aria-hidden
          style={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s',
            fontSize: 9,
          }}
        >
          ▾
        </span>
      </button>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      style={{
        height: 3,
        background: 'hsl(var(--rt-ink-15))',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          height: '100%',
          background: 'hsl(var(--rt-accent))',
          transition: 'width 0.3s',
        }}
      />
    </div>
  );
}

function PresetRow({
  presets,
  currentPreset,
  onApply,
  padding,
  scroll = false,
}: {
  presets: PresetDef[];
  currentPreset: string | null;
  onApply: (codes: string[]) => void;
  padding: string;
  scroll?: boolean;
}) {
  return (
    <div
      style={{
        padding,
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
        background: 'hsl(var(--rt-alt))',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 6,
          ...(scroll
            ? { overflowX: 'auto', WebkitOverflowScrolling: 'touch' }
            : { flexWrap: 'wrap' }),
        }}
      >
        {presets.map((p) => (
          <PresetChip
            key={p.id}
            active={currentPreset === p.id}
            onClick={() => onApply(p.codes)}
          >
            {p.label}
          </PresetChip>
        ))}
      </div>
    </div>
  );
}

function PresetChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 10px',
        borderRadius: 14,
        border: active
          ? '1px solid hsl(var(--rt-accent))'
          : '1px solid hsl(var(--rt-border-subtle))',
        background: active ? 'hsl(var(--rt-accent-bg))' : 'hsl(var(--rt-paper))',
        fontSize: 11,
        fontFamily: 'var(--rt-font-sans)',
        fontWeight: active ? 600 : 500,
        color: active ? 'hsl(var(--rt-accent))' : 'hsl(var(--rt-ink-60))',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// ─── Criteria drawer (inline desktop) ──────────────────────────

function CriteriaDrawer({
  criteria,
  active,
  onToggle,
  onSetAll,
  onSetNone,
  columns,
}: {
  criteria: RatingMethodologyCriterion[];
  active: Set<string>;
  onToggle: (code: string) => void;
  onSetAll: () => void;
  onSetNone: () => void;
  columns: number;
}) {
  return (
    <div
      style={{
        padding: '20px 40px 24px',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
        background: 'hsl(var(--rt-paper))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <Eyebrow>
          {criteria.length} критериев · упорядочены по весу
        </Eyebrow>
        <T size={11} color="hsl(var(--rt-ink-60))">
          Нажмите, чтобы выключить ненужное
        </T>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onSetAll} style={textLinkStyle}>
          Включить все
        </button>
        <button type="button" onClick={onSetNone} style={textLinkStyle}>
          Очистить
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 6,
        }}
      >
        {criteria.map((c) => (
          <CriterionChip
            key={c.code}
            criterion={c}
            on={active.has(c.code)}
            onClick={() => onToggle(c.code)}
          />
        ))}
      </div>
    </div>
  );
}

const textLinkStyle: CSSProperties = {
  cursor: 'pointer',
  fontSize: 11,
  color: 'hsl(var(--rt-ink-60))',
  background: 'transparent',
  border: 0,
  textDecoration: 'underline',
  textDecorationColor: 'hsl(var(--rt-border))',
  textUnderlineOffset: 3,
  padding: 0,
};

function CriterionChip({
  criterion,
  on,
  onClick,
}: {
  criterion: RatingMethodologyCriterion;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 4,
        background: on ? 'hsl(var(--rt-accent-bg))' : 'hsl(var(--rt-alt))',
        border: on
          ? '1px solid hsl(var(--rt-accent))'
          : '1px solid transparent',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
        textAlign: 'left',
        width: '100%',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 12,
          height: 12,
          borderRadius: 2,
          border: on
            ? '1.5px solid hsl(var(--rt-accent))'
            : '1.5px solid hsl(var(--rt-border))',
          background: on ? 'hsl(var(--rt-accent))' : 'transparent',
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {on && (
          <svg
            viewBox="0 0 12 12"
            style={{ position: 'absolute', inset: -1.5, width: 12, height: 12 }}
          >
            <path
              d="M3 6 L5 8 L9 4"
              stroke="#fff"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span
        style={{
          flex: 1,
          lineHeight: 1.3,
          fontSize: 11,
          fontFamily: 'var(--rt-font-sans)',
          fontWeight: on ? 500 : 400,
          color: on ? 'hsl(var(--rt-ink))' : 'hsl(var(--rt-ink-60))',
          textDecoration: on ? 'none' : 'line-through',
          textDecorationColor: 'hsl(var(--rt-ink-15))',
        }}
      >
        {criterion.name_ru}
      </span>
      <span
        style={{
          fontSize: 10,
          fontFamily: 'var(--rt-font-mono)',
          color: on ? 'hsl(var(--rt-accent))' : 'hsl(var(--rt-ink-40))',
          flexShrink: 0,
        }}
      >
        {criterion.weight}%
      </span>
    </button>
  );
}

// ─── Desktop table ─────────────────────────────────────────────

interface RankedRow {
  model: RatingModelListItem;
  score: number;
  base: number;
}

function useDisplayRows(
  models: RatingModelListItem[],
  criteria: RatingMethodologyCriterion[],
  active: Set<string>,
  allCodes: string[],
): WithDisplayRank<RankedRow>[] {
  return useMemo(() => {
    const allSet = new Set(allCodes);
    const rows: RankedRow[] = models.map((m) => ({
      model: m,
      score: computeIndex(m, active, criteria),
      base: computeIndex(m, allSet, criteria),
    }));
    return applyAdPositioning(rows, {
      getId: (r) => r.model.id,
      getIsAd: (r) => r.model.is_ad,
      getAdPosition: (r) => r.model.ad_position,
      sortRegular: (xs) => xs.slice().sort((a, b) => b.score - a.score),
    });
  }, [models, active, criteria, allCodes]);
}

function DesktopCustomTable({
  criteria,
  allCodes,
  active,
  models,
}: {
  criteria: RatingMethodologyCriterion[];
  allCodes: string[];
  active: Set<string>;
  models: RatingModelListItem[];
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const rows = useDisplayRows(models, criteria, active, allCodes);
  const orderKey = active.size === 0 ? 'empty' : rows.map((r) => r.model.id).join(',');
  const register = useFlip(orderKey);
  const shown = rows.slice(0, visible);
  const remaining = rows.length - visible;

  if (active.size === 0) return <EmptyCustom />;

  return (
    <div style={{ padding: '8px 40px 8px' }}>
      {shown.map((r) => (
        <DesktopCustomRow key={r.model.id} row={r} register={register} />
      ))}
      {remaining > 0 && (
        <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            style={loadMoreStyle}
          >
            Показать ещё {Math.min(PAGE_SIZE, remaining)}
          </button>
        </div>
      )}
    </div>
  );
}

const loadMoreStyle: CSSProperties = {
  padding: '10px 22px',
  background: 'transparent',
  border: '1px solid hsl(var(--rt-border))',
  borderRadius: 4,
  fontFamily: 'var(--rt-font-sans)',
  fontSize: 12,
  fontWeight: 500,
  color: 'hsl(var(--rt-ink))',
  cursor: 'pointer',
};

function DesktopCustomRow({
  row,
  register,
}: {
  row: WithDisplayRank<RankedRow>;
  register: (key: number, el: HTMLElement | null) => void;
}) {
  const { model, score, base } = row;
  const isAd = row._displayRank === null;
  const delta = score - base;
  const deltaAbs = Math.abs(delta);
  const deltaDir = delta > 0.2 ? 'up' : delta < -0.2 ? 'down' : 'same';
  return (
    <Link
      ref={(el) => register(model.id, el as HTMLElement | null)}
      href={`/rating-split-system/${model.slug}/`}
      data-ad={isAd ? 'true' : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: TABLE_GRID,
        padding: '18px 0',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
        alignItems: 'center',
        color: 'hsl(var(--rt-ink))',
        textDecoration: 'none',
        willChange: 'transform',
        background: isAd ? AD_ROW_BACKGROUND : undefined,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--rt-font-mono)',
          fontSize: 14,
          color: 'hsl(var(--rt-ink-40))',
          fontWeight: 500,
          letterSpacing: -0.5,
          paddingLeft: isAd ? 4 : 0,
        }}
      >
        {isAd ? <AdBadge /> : row._displayRank}
      </span>
      <span
        style={{
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BrandLogo
          src={model.brand_logo}
          srcDark={model.brand_logo_dark}
          name={model.brand}
          size={28}
          tooltip={model.brand}
        />
      </span>
      <span />
      <T size={13} weight={600} style={{ letterSpacing: -0.1 }}>
        {model.series || '—'}
      </T>
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
        {model.inner_unit || model.series}
      </span>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
          paddingRight: 14,
        }}
      >
        <span title='Значение индекса «Август-климат»'>
          <T size={12} color="hsl(var(--rt-ink-60))" mono>
            {base.toFixed(1)}
          </T>
        </span>
        {deltaDir === 'same' ? (
          <T size={10} color="hsl(var(--rt-ink-40))" mono>
            ·
          </T>
        ) : (
          <T
            size={10}
            color={
              deltaDir === 'up'
                ? 'hsl(var(--rt-ok))'
                : 'hsl(var(--rt-warn))'
            }
            mono
          >
            {deltaDir === 'up' ? '↑' : '↓'}
            {deltaAbs.toFixed(1)}
          </T>
        )}
      </span>
      <T size={13} weight={500}>
        {formatPrice(model.price)}
      </T>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Meter value={score} />
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'hsl(var(--rt-accent))',
            fontFamily: 'var(--rt-font-serif)',
            letterSpacing: -0.2,
          }}
        >
          {score.toFixed(1)}
        </span>
      </span>
    </Link>
  );
}

function AdBadge() {
  return (
    <span
      style={{
        fontSize: 10,
        fontFamily: 'var(--rt-font-mono)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        color: 'hsl(var(--rt-ink-60))',
        padding: '2px 6px',
        background: AD_BADGE_BACKGROUND,
        borderRadius: 2,
      }}
    >
      Реклама
    </span>
  );
}

function EmptyCustom() {
  return (
    <div style={{ padding: '60px 40px', textAlign: 'center' }}>
      <T size={14} color="hsl(var(--rt-ink-60))">
        Включите хотя бы один критерий — и увидите рейтинг под ваши приоритеты.
      </T>
    </div>
  );
}

// ─── Mobile list + sheet ───────────────────────────────────────

function MobileCustomList({
  criteria,
  allCodes,
  active,
  models,
}: {
  criteria: RatingMethodologyCriterion[];
  allCodes: string[];
  active: Set<string>;
  models: RatingModelListItem[];
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const rows = useDisplayRows(models, criteria, active, allCodes);
  const orderKey = active.size === 0 ? 'empty' : rows.map((r) => r.model.id).join(',');
  const register = useFlip(orderKey);
  const shown = rows.slice(0, visible);
  const remaining = rows.length - visible;

  if (active.size === 0) return <EmptyCustom />;

  return (
    <>
      <div style={{ padding: '4px 18px 0' }}>
        {shown.map((r) => {
          const isAd = r._displayRank === null;
          const rk = r._displayRank ?? 0;
          const podium = !isAd && rk <= 3;
          const delta = r.score - r.base;
          const deltaAbs = Math.abs(delta);
          const deltaDir = delta > 0.2 ? 'up' : delta < -0.2 ? 'down' : 'same';
          return (
            <div
              key={r.model.id}
              ref={(el) => register(r.model.id, el)}
              data-ad={isAd ? 'true' : undefined}
              style={{
                borderBottom: '1px solid hsl(var(--rt-border-subtle))',
                willChange: 'transform',
                background: isAd ? AD_ROW_BACKGROUND : undefined,
                marginInline: isAd ? -18 : 0,
                paddingInline: isAd ? 18 : 0,
              }}
            >
              <Link
                href={`/rating-split-system/${r.model.slug}/`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '34px 1fr auto',
                  gap: 12,
                  padding: '14px 0',
                  alignItems: 'center',
                  textDecoration: 'none',
                  color: 'hsl(var(--rt-ink))',
                }}
              >
                <span
                  style={{
                    fontFamily: podium ? 'var(--rt-font-serif)' : 'var(--rt-font-mono)',
                    fontSize: podium ? 24 : 13,
                    color: podium ? 'hsl(var(--rt-accent))' : 'hsl(var(--rt-ink-40))',
                    fontWeight: podium ? 600 : 500,
                    letterSpacing: -0.4,
                    lineHeight: 1,
                  }}
                >
                  {isAd ? <AdBadge /> : rk}
                </span>
                <span style={{ minWidth: 0, display: 'block' }}>
                  <span style={{ marginBottom: 3, display: 'block' }}>
                    <BrandLogo
                      src={r.model.brand_logo}
                      srcDark={r.model.brand_logo_dark}
                      name={r.model.brand}
                      size={28}
                    />
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'hsl(var(--rt-ink-60))',
                      lineHeight: 1.3,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'block',
                    }}
                  >
                    {r.model.inner_unit || r.model.series}
                  </span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 5,
                      justifyContent: 'flex-end',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--rt-font-serif)',
                        fontSize: 16,
                        fontWeight: 600,
                        color: 'hsl(var(--rt-accent))',
                        letterSpacing: -0.2,
                        lineHeight: 1,
                      }}
                    >
                      {r.score.toFixed(1)}
                    </span>
                    {deltaDir !== 'same' && (
                      <span
                        style={{
                          fontFamily: 'var(--rt-font-mono)',
                          fontSize: 9,
                          color:
                            deltaDir === 'up'
                              ? 'hsl(var(--rt-ok))'
                              : 'hsl(var(--rt-warn))',
                        }}
                      >
                        {deltaDir === 'up' ? '↑' : '↓'}
                        {deltaAbs.toFixed(1)}
                      </span>
                    )}
                  </span>
                  <span
                    title='Значение индекса «Август-климат»'
                    style={{
                      marginTop: 3,
                      fontFamily: 'var(--rt-font-mono)',
                      fontSize: 10,
                      color: 'hsl(var(--rt-ink-40))',
                      display: 'block',
                    }}
                  >
                    база {r.base.toFixed(1)}
                  </span>
                  <span
                    style={{
                      marginTop: 3,
                      fontSize: 11,
                      color: 'hsl(var(--rt-ink-60))',
                      display: 'block',
                    }}
                  >
                    {formatPrice(r.model.price)}
                  </span>
                </span>
              </Link>
            </div>
          );
        })}
      </div>
      {remaining > 0 && (
        <div
          style={{
            padding: 18,
            display: 'flex',
            justifyContent: 'center',
            borderTop: '1px solid hsl(var(--rt-border-subtle))',
          }}
        >
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            style={loadMoreStyle}
          >
            Показать ещё {Math.min(PAGE_SIZE, remaining)}
          </button>
        </div>
      )}
    </>
  );
}

function MobileCriteriaSheet({
  criteria,
  active,
  activeCount,
  activeWeight,
  onToggle,
  onSetAll,
  onSetNone,
  presets,
  currentPreset,
  onApplyPreset,
  onClose,
}: {
  criteria: RatingMethodologyCriterion[];
  active: Set<string>;
  activeCount: number;
  activeWeight: number;
  onToggle: (code: string) => void;
  onSetAll: () => void;
  onSetNone: () => void;
  presets: PresetDef[];
  currentPreset: string | null;
  onApplyPreset: (codes: string[]) => void;
  onClose: () => void;
}) {
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
              Настроить критерии
            </T>
            <T size={11} color="hsl(var(--rt-ink-60))" style={{ marginTop: 2, display: 'block' }}>
              активно {activeCount} из {criteria.length} · вес {activeWeight}%
            </T>
          </div>
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
        <div style={{ padding: '12px 18px', borderBottom: '1px solid hsl(var(--rt-border-subtle))' }}>
          <Eyebrow style={{ display: 'block', marginBottom: 8 }}>Пресеты</Eyebrow>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {presets.map((p) => (
              <PresetChip
                key={p.id}
                active={currentPreset === p.id}
                onClick={() => onApplyPreset(p.codes)}
              >
                {p.label}
              </PresetChip>
            ))}
          </div>
        </div>
        <div style={{ padding: '8px 18px 24px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 12px' }}>
            <Eyebrow>{criteria.length} критериев · по весу ↓</Eyebrow>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={onSetAll} style={textLinkStyle}>
              Все
            </button>
            <button type="button" onClick={onSetNone} style={textLinkStyle}>
              Очистить
            </button>
          </div>
          {criteria.map((c) => {
            const on = active.has(c.code);
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => onToggle(c.code)}
                aria-pressed={on}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: '1px solid hsl(var(--rt-border-subtle))',
                  background: 'transparent',
                  border: 0,
                  borderBottomStyle: 'solid',
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 3,
                    border: on
                      ? '1.5px solid hsl(var(--rt-accent))'
                      : '1.5px solid hsl(var(--rt-border))',
                    background: on ? 'hsl(var(--rt-accent))' : 'transparent',
                    flexShrink: 0,
                    position: 'relative',
                  }}
                >
                  {on && (
                    <svg viewBox="0 0 18 18" style={{ position: 'absolute', inset: 0 }}>
                      <path
                        d="M4 9 L8 13 L14 5"
                        stroke="#fff"
                        strokeWidth="2"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <T
                  size={13}
                  weight={on ? 500 : 400}
                  color={on ? 'hsl(var(--rt-ink))' : 'hsl(var(--rt-ink-60))'}
                  style={{
                    flex: 1,
                    lineHeight: 1.35,
                    textDecoration: on ? 'none' : 'line-through',
                    textDecorationColor: 'hsl(var(--rt-ink-15))',
                  }}
                >
                  {c.name_ru}
                </T>
                <T
                  size={11}
                  color={on ? 'hsl(var(--rt-accent))' : 'hsl(var(--rt-ink-40))'}
                  mono
                  style={{ flexShrink: 0, minWidth: 28, textAlign: 'right' }}
                >
                  {c.weight}%
                </T>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Compute index ─────────────────────────────────────────────

export function computeIndex(
  model: RatingModelListItem,
  active: Set<string>,
  criteria: RatingMethodologyCriterion[]
): number {
  let num = 0;
  let den = 0;
  for (const c of criteria) {
    if (!active.has(c.code)) continue;
    const s = model.scores?.[c.code];
    if (s == null) continue;
    num += c.weight * s;
    den += c.weight;
  }
  if (den === 0) return 0;
  return num / den;
}

// ─── Presets (приходят из API, см. methodology.presets) ────────

interface PresetDef {
  id: string;
  label: string;
  codes: string[];
}

function detectPreset(active: Set<string>, presets: PresetDef[]): string | null {
  for (const p of presets) {
    if (p.codes.length !== active.size) continue;
    let same = true;
    for (const code of p.codes) {
      if (!active.has(code)) {
        same = false;
        break;
      }
    }
    if (same) return p.id;
  }
  return null;
}
