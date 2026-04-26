'use client';

import { useMemo, useState } from 'react';
import type {
  RatingMethodology,
  RatingMethodologyCriterion,
  RatingModelDetail,
  RatingParameterScore,
} from '@/lib/api/types/rating';
import { Eyebrow, H, Meter, T } from './primitives';
import CriterionTooltip from './CriterionTooltip';
import DetailEditorial from './DetailEditorial';

type CritView = 'list' | 'radar';

type Props = {
  detail: RatingModelDetail;
  /** Число активных критериев — берётся из methodology.stats.active_criteria_count.
   *  parameter_scores.length может включать неактивные критерии (бекенд добавляет
   *  их если у модели есть raw_value), поэтому для заголовка используем stats. */
  activeCriteriaCount: number;
  methodology: RatingMethodology | null;
};

const VIEW_DEFS: { id: CritView; label: string; icon: string }[] = [
  { id: 'list', label: 'Список', icon: 'M3 5h14M3 10h14M3 15h14' },
  {
    id: 'radar',
    label: 'Паутинка',
    icon: 'M10 2 L18 8 L15 17 L5 17 L2 8 Z M10 2 L10 17 M2 8 L18 8 M5 17 L15 17',
  },
];

// Плюрализация слова «параметр» в Им.п. (1 параметр / 2-4 параметра / 5+ параметров).
// Вырезана из общего pluralize(), чтобы явно контролировать формат заголовка.
export function pluralParam(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'параметров';
  if (mod10 === 1) return 'параметр';
  if (mod10 >= 2 && mod10 <= 4) return 'параметра';
  return 'параметров';
}

type EnrichedScore = RatingParameterScore & {
  description_ru: string;
  is_key_measurement: boolean;
  is_active: boolean;
};

// Капитализация первой буквы значения — «да» → «Да», «есть через…» → «Есть через…».
// Числовые / уже капитализированные / пустые значения возвращаются как есть.
export function capitalizeFirst(s: string): string {
  if (!s) return s;
  const first = s.charAt(0);
  const upper = first.toUpperCase();
  if (first === upper) return s;
  return upper + s.slice(1);
}

export default function DetailCriteria({
  detail,
  activeCriteriaCount,
  methodology,
}: Props) {
  const [view, setView] = useState<CritView>('list');

  const enrichedScores = useMemo<EnrichedScore[]>(() => {
    const byCode = new Map<string, RatingMethodologyCriterion>();
    for (const c of methodology?.criteria ?? []) {
      byCode.set(c.code, c);
    }
    return detail.parameter_scores.map((s) => {
      const crit = byCode.get(s.criterion_code);
      // is_key_measurement: для активных берём из methodology (она содержит только
      // is_active=True); для inactive — fallback на поле parameter_score, если backend
      // его дотащит. Сейчас для inactive в production будет false до правки backend.
      const isKey = crit?.is_key_measurement ?? s.is_key_measurement ?? false;
      return {
        ...s,
        description_ru: crit?.description_ru ?? '',
        is_key_measurement: Boolean(isKey),
        is_active: s.is_active ?? true,
      };
    });
  }, [detail.parameter_scores, methodology]);

  // Ключевые замеры — первыми. Внутри keyMeasurements: активные с весом по убыванию,
  // далее inactive-key с непустым raw_value (Polish-4 п.4.6 — Максим хочет видеть их
  // даже когда параметр не участвует в индексе). Регулярные — после.
  const sortedScores = useMemo(() => {
    const sorted = [...enrichedScores].sort(
      (a, b) => b.weighted_score - a.weighted_score,
    );
    const keyActive = sorted.filter(
      (s) => s.is_active && s.is_key_measurement,
    );
    const keyInactiveWithValue = sorted.filter(
      (s) =>
        !s.is_active
        && s.is_key_measurement
        && s.raw_value != null
        && String(s.raw_value).trim() !== '',
    );
    // rest: всё кроме ключевых. inactive-key без raw_value полностью скрываем
    // (Polish-4 п.4.6: «при условии того, что он заполнен»).
    const rest = sorted.filter((s) => {
      if (s.is_key_measurement && s.is_active) return false;
      if (s.is_key_measurement && !s.is_active) return false;
      return true;
    });
    return [...keyActive, ...keyInactiveWithValue, ...rest];
  }, [enrichedScores]);

  return (
    <section
      data-anchor="criteria"
      className="rt-detail-criteria"
      style={{ padding: '40px 40px 32px' }}
    >
      <header
        className="rt-criteria-head"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 22,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow>Оценки по критериям</Eyebrow>
          <H size={26} serif style={{ marginTop: 8, letterSpacing: -0.3 }}>
            {activeCriteriaCount} {pluralParam(activeCriteriaCount)} рейтинга
          </H>
        </div>
        <ViewSwitcher view={view} onChange={setView} />
      </header>

      <div className="rt-criteria-layout">
        <div className="rt-criteria-main">
          {view === 'list' && <ListView scores={sortedScores} />}
          {view === 'radar' && (
            <RadarView scores={sortedScores} totalIndex={detail.total_index} />
          )}
        </div>
        <aside className="rt-criteria-aside">
          <DetailEditorial detail={detail} />
        </aside>
      </div>

      <style>{`
        .rt-criteria-layout {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 40px;
          align-items: start;
        }
        .rt-criteria-main { min-width: 0; }
        .rt-criteria-aside { min-width: 0; }
        @media (max-width: 1023px) {
          .rt-criteria-layout {
            grid-template-columns: 1fr !important;
            gap: 28px !important;
          }
          .rt-criteria-aside { order: -1; }
        }
        @media (max-width: 899px) {
          .rt-detail-criteria { padding: 24px 18px 24px !important; }
          .rt-switcher-label { display: none !important; }
          .rt-list-row-contrib { display: none !important; }
        }
      `}</style>
    </section>
  );
}

function ViewSwitcher({
  view,
  onChange,
}: {
  view: CritView;
  onChange: (v: CritView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Вид оценок"
      style={{
        display: 'inline-flex',
        border: '1px solid hsl(var(--rt-border-subtle))',
        borderRadius: 6,
        background: 'hsl(var(--rt-paper))',
        padding: 3,
      }}
    >
      {VIEW_DEFS.map((v) => {
        const active = view === v.id;
        return (
          <button
            key={v.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '7px 12px',
              border: 0,
              borderRadius: 4,
              background: active ? 'hsl(var(--rt-ink))' : 'transparent',
              color: active
                ? 'hsl(var(--rt-paper))'
                : 'hsl(var(--rt-ink-60))',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--rt-font-sans)',
            }}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d={v.icon} />
            </svg>
            <span className="rt-switcher-label">{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ListView({ scores }: { scores: EnrichedScore[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {scores.map((s) =>
        s.is_key_measurement ? (
          <KeyMeasurementRow key={s.criterion_code} score={s} />
        ) : (
          <ListRow key={s.criterion_code} score={s} />
        ),
      )}
    </div>
  );
}

function ListRow({ score }: { score: EnrichedScore }) {
  const tickerKind: 'above' | 'below' | null = score.above_reference
    ? 'above'
    : score.normalized_score < 40
      ? 'below'
      : null;
  const chipValue =
    [capitalizeFirst(score.raw_value || ''), score.unit].filter(Boolean).join(' ').trim() || '—';

  return (
    <div
      style={{
        padding: '16px 0',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <T size={13} weight={600}>
          {score.criterion_name}:
        </T>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '3px 10px',
            background: 'hsl(var(--rt-accent-bg))',
            color: 'hsl(var(--rt-accent))',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'var(--rt-font-mono)',
            letterSpacing: -0.1,
          }}
        >
          {chipValue}
        </span>
        <CriterionTooltip description={score.description_ru} />
        <div style={{ flex: 1 }} />
        <ReferenceMarker kind={tickerKind} />
      </div>
      <div style={{ marginTop: 10 }}>
        <Meter value={score.normalized_score} width="100%" height={4} />
      </div>
      <div
        style={{
          marginTop: 7,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <T
          size={11}
          color="hsl(var(--rt-ink-60))"
          mono
          className="rt-list-row-contrib"
        >
          Вклад в индекс:{' '}
          <span style={{ color: 'hsl(var(--rt-ink))', fontWeight: 600 }}>
            {score.weighted_score.toFixed(2)}
          </span>
        </T>
        <div style={{ fontFamily: 'var(--rt-font-mono)', fontSize: 12 }}>
          <span
            style={{
              color: 'hsl(var(--rt-ink))',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {score.normalized_score.toFixed(1)}
          </span>
          <span style={{ color: 'hsl(var(--rt-ink-40))' }}> / 100</span>
        </div>
      </div>
    </div>
  );
}

function ReferenceMarker({ kind }: { kind: 'above' | 'below' | null }) {
  if (!kind) return null;
  const color = kind === 'above' ? '#1f8f4c' : '#b24a3b';
  const label = kind === 'above' ? 'Выше медианы класса' : 'Ниже медианы класса';
  return (
    <span
      title={label}
      aria-label={label}
      style={{
        fontSize: 12,
        color,
        fontFamily: 'var(--rt-font-mono)',
        lineHeight: 1,
      }}
    >
      {kind === 'above' ? '▲' : '▼'}
    </span>
  );
}

function KeyMeasurementRow({ score }: { score: EnrichedScore }) {
  const tickerKind: 'above' | 'below' | null = score.above_reference
    ? 'above'
    : score.normalized_score < 40
      ? 'below'
      : null;
  const chipValue =
    [capitalizeFirst(score.raw_value || ''), score.unit].filter(Boolean).join(' ').trim() || '—';

  return (
    <div
      data-testid="key-measurement-row"
      style={{
        padding: '16px 18px',
        marginBottom: 10,
        background: 'hsl(var(--rt-accent-bg))',
        border: '1px solid hsl(var(--rt-accent))',
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--rt-font-mono)',
          fontSize: 10,
          color: 'hsl(var(--rt-accent))',
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Ключевой замер
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <T size={14} weight={600}>
          {score.criterion_name}:
        </T>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '3px 10px',
            background: 'hsl(var(--rt-paper))',
            color: 'hsl(var(--rt-accent))',
            border: '1px solid hsl(var(--rt-accent))',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: 'var(--rt-font-mono)',
            letterSpacing: -0.1,
          }}
        >
          {chipValue}
        </span>
        <CriterionTooltip description={score.description_ru} />
        <div style={{ flex: 1 }} />
        <ReferenceMarker kind={tickerKind} />
      </div>
      <div style={{ marginTop: 10 }}>
        <Meter value={score.normalized_score} width="100%" height={4} />
      </div>
      <div
        style={{
          marginTop: 7,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <T
          size={11}
          color="hsl(var(--rt-ink-60))"
          mono
          className="rt-list-row-contrib"
        >
          Вклад в индекс:{' '}
          <span style={{ color: 'hsl(var(--rt-ink))', fontWeight: 600 }}>
            {score.weighted_score.toFixed(2)}
          </span>
        </T>
        <div style={{ fontFamily: 'var(--rt-font-mono)', fontSize: 12 }}>
          <span
            style={{
              color: 'hsl(var(--rt-ink))',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {score.normalized_score.toFixed(1)}
          </span>
          <span style={{ color: 'hsl(var(--rt-ink-40))' }}> / 100</span>
        </div>
      </div>
    </div>
  );
}

function RadarView({
  scores,
  totalIndex,
}: {
  scores: EnrichedScore[];
  totalIndex: number;
}) {
  const N = scores.length;
  if (N === 0) return null;
  const cx = 280;
  const cy = 280;
  const R = 210;
  const rings = [20, 40, 60, 80, 100];
  const pt = (i: number, r: number): [number, number] => {
    const a = -Math.PI / 2 + (i / N) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const polygon = scores
    .map((s, i) => pt(i, (s.normalized_score / 100) * R).join(','))
    .join(' ');

  return (
    <div style={{ padding: '12px 0 20px' }}>
      <svg
        width="100%"
        viewBox="0 0 560 620"
        style={{ maxWidth: 560, color: 'hsl(var(--rt-ink))' }}
      >
        {rings.map((p) => (
          <polygon
            key={p}
            points={scores
              .map((_, i) => pt(i, (p / 100) * R).join(','))
              .join(' ')}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.12}
          />
        ))}
        {scores.map((s, i) => {
          const [x, y] = pt(i, R);
          const [lx, ly] = pt(i, R + 16);
          const a = -Math.PI / 2 + (i / N) * Math.PI * 2;
          const anchor =
            Math.cos(a) > 0.15
              ? 'start'
              : Math.cos(a) < -0.15
                ? 'end'
                : 'middle';
          const name = s.criterion_name;
          const short = name.length > 22 ? `${name.slice(0, 20)}…` : name;
          return (
            <g key={s.criterion_code}>
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.1}
              />
              <text
                x={lx}
                y={ly}
                fontSize="8.5"
                fill="currentColor"
                opacity={0.75}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontFamily="ui-sans-serif, system-ui"
              >
                {short}
              </text>
            </g>
          );
        })}
        <polygon
          points={polygon}
          fill="hsl(var(--rt-accent))"
          fillOpacity={0.18}
          stroke="hsl(var(--rt-accent))"
          strokeWidth={1.3}
        />
        {scores.map((s, i) => {
          const [x, y] = pt(i, (s.normalized_score / 100) * R);
          return (
            <circle
              key={s.criterion_code}
              cx={x}
              cy={y}
              r={2.8}
              fill="hsl(var(--rt-accent))"
            />
          );
        })}
        {rings.map((p) => (
          <text
            key={p}
            x={cx + 4}
            y={cy - (p / 100) * R - 2}
            fontSize="9"
            fill="currentColor"
            opacity={0.35}
            fontFamily="ui-monospace, monospace"
          >
            {p}
          </text>
        ))}
      </svg>
      <T
        size={11}
        color="hsl(var(--rt-ink-60))"
        style={{ marginTop: 10, display: 'block' }}
      >
        Площадь заполнения —{' '}
        <span style={{ color: 'hsl(var(--rt-ink))', fontWeight: 600 }}>
          {totalIndex.toFixed(1)} / 100
        </span>
        . Чем ближе фигура к внешнему контуру, тем выше итоговый индекс модели.
      </T>
    </div>
  );
}
