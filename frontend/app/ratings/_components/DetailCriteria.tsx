'use client';

import { useMemo, useState } from 'react';
import type {
  RatingModelDetail,
  RatingParameterScore,
} from '@/lib/api/types/rating';
import { Eyebrow, H, Meter, T } from './primitives';

type CritView = 'list' | 'radar' | 'grid';

type Props = {
  detail: RatingModelDetail;
};

const VIEW_DEFS: { id: CritView; label: string; icon: string }[] = [
  { id: 'list', label: 'Список', icon: 'M3 5h14M3 10h14M3 15h14' },
  {
    id: 'radar',
    label: 'Паутинка',
    icon: 'M10 2 L18 8 L15 17 L5 17 L2 8 Z M10 2 L10 17 M2 8 L18 8 M5 17 L15 17',
  },
  {
    id: 'grid',
    label: 'Сетка',
    icon: 'M3 3h6v6H3z M11 3h6v6h-6z M3 11h6v6H3z M11 11h6v6h-6z',
  },
];

export default function DetailCriteria({ detail }: Props) {
  const [view, setView] = useState<CritView>('list');
  const scores = useMemo(
    () =>
      [...detail.parameter_scores].sort(
        (a, b) => b.weighted_score - a.weighted_score,
      ),
    [detail.parameter_scores],
  );

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
            {scores.length} параметров рейтинга
          </H>
        </div>
        <ViewSwitcher view={view} onChange={setView} />
      </header>

      {view === 'list' && <ListView scores={scores} />}
      {view === 'radar' && <RadarView scores={scores} totalIndex={detail.total_index} />}
      {view === 'grid' && <GridView scores={scores} />}

      <style>{`
        @media (max-width: 899px) {
          .rt-detail-criteria { padding: 24px 18px 24px !important; }
          .rt-switcher-label { display: none !important; }
          .rt-list-row-contrib { display: none !important; }
          .rt-grid-view { grid-template-columns: 1fr 1fr !important; }
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

function ListView({ scores }: { scores: RatingParameterScore[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {scores.map((s) => (
        <ListRow key={s.criterion_code} score={s} />
      ))}
    </div>
  );
}

function ListRow({ score }: { score: RatingParameterScore }) {
  const tickerText = score.above_reference
    ? 'выше эталона'
    : score.normalized_score < 40
      ? 'ниже эталона'
      : null;
  const tickerColor = score.above_reference ? '#1f8f4c' : '#b24a3b';
  const chipValue = [score.raw_value, score.unit].filter(Boolean).join(' ').trim() || '—';

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
        <span
          title={`Методика: как считается «${score.criterion_name}»`}
          aria-label="Как считается"
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '1px solid hsl(var(--rt-ink-40))',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            color: 'hsl(var(--rt-ink-40))',
            fontWeight: 600,
            cursor: 'help',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ?
        </span>
        <div style={{ flex: 1 }} />
        {tickerText && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: tickerColor,
              fontFamily: 'var(--rt-font-mono)',
              letterSpacing: 0.2,
            }}
          >
            {tickerText}
          </span>
        )}
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
  scores: RatingParameterScore[];
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

function GridView({ scores }: { scores: RatingParameterScore[] }) {
  return (
    <div
      className="rt-grid-view"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 10,
      }}
    >
      {scores.map((s) => (
        <GridCard key={s.criterion_code} score={s} />
      ))}
    </div>
  );
}

function GridCard({ score }: { score: RatingParameterScore }) {
  const chipValue =
    [score.raw_value, score.unit].filter(Boolean).join(' ').trim() || '—';
  const tickerText = score.above_reference
    ? 'выше'
    : score.normalized_score < 40
      ? 'ниже'
      : null;
  const tickerColor = score.above_reference ? '#1f8f4c' : '#b24a3b';

  return (
    <div
      style={{
        padding: '12px 14px',
        border: '1px solid hsl(var(--rt-border-subtle))',
        borderRadius: 6,
        background: 'hsl(var(--rt-paper))',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <T size={11} weight={600} style={{ lineHeight: 1.3 }}>
        {score.criterion_name}
      </T>
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            padding: '2px 8px',
            background: 'hsl(var(--rt-accent-bg))',
            color: 'hsl(var(--rt-accent))',
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'var(--rt-font-mono)',
          }}
        >
          {chipValue}
        </span>
        {tickerText && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: tickerColor,
              fontFamily: 'var(--rt-font-mono)',
            }}
          >
            {tickerText}
          </span>
        )}
      </div>
      <div style={{ marginTop: 10 }}>
        <Meter value={score.normalized_score} width="100%" height={3} />
      </div>
      <div
        style={{
          marginTop: 7,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <T size={9} color="hsl(var(--rt-ink-60))" mono>
          Вклад {score.weighted_score.toFixed(2)}
        </T>
        <div style={{ fontFamily: 'var(--rt-font-mono)', fontSize: 10 }}>
          <span
            style={{
              color: 'hsl(var(--rt-ink))',
              fontWeight: 700,
              fontSize: 12,
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
