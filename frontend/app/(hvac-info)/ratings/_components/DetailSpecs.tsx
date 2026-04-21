import type {
  RatingMethodology,
  RatingModelDetail,
} from '@/lib/api/types/rating';
import { Eyebrow, H, T } from './primitives';
import { buildSpecGroups, countSpecRows, type SpecGroup, type SpecRow } from './specs';

type Props = {
  detail: RatingModelDetail;
  methodology: RatingMethodology | null;
};

export default function DetailSpecs({ detail, methodology }: Props) {
  const groups = buildSpecGroups(detail, methodology);
  const totalRows = countSpecRows(groups);
  if (groups.length === 0) return null;

  return (
    <section
      data-anchor="specs"
      className="rt-detail-specs"
      style={{
        padding: '40px 40px 36px',
        borderTop: '1px solid hsl(var(--rt-border-subtle))',
      }}
    >
      <header
        className="rt-specs-head"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 26,
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow>Технические характеристики</Eyebrow>
          <H size={26} serif style={{ marginTop: 6, letterSpacing: -0.3 }}>
            Паспорт модели · {totalRows} параметров в {groups.length}{' '}
            {groupsPlural(groups.length)}
          </H>
        </div>
        <div
          className="rt-specs-source"
          style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}
        >
          <Eyebrow>Источник: рейтинг · {detail.methodology_version || '—'}</Eyebrow>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['PDF', 'CSV', 'Копировать'] as const).map((label) => (
              <span
                key={label}
                aria-disabled
                style={{
                  padding: '6px 10px',
                  border: '1px solid hsl(var(--rt-border))',
                  borderRadius: 4,
                  fontSize: 11,
                  color: 'hsl(var(--rt-ink-40))',
                  fontFamily: 'var(--rt-font-mono)',
                  cursor: 'not-allowed',
                  userSelect: 'none',
                }}
              >
                ↓ {label}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div
        className="rt-specs-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 28,
        }}
      >
        {groups.map((g) => (
          <SpecCard key={g.group} group={g} />
        ))}
      </div>

      <T
        size={11}
        color="hsl(var(--rt-ink-40))"
        style={{ marginTop: 18, fontStyle: 'italic', lineHeight: 1.5, display: 'block' }}
      >
        <span style={{ color: '#1f8f4c' }}>▲</span> — параметр лучше эталона класса,{' '}
        <span style={{ color: '#b24a3b' }}>▼</span> — хуже. Эталон рассчитан по медиане{' '}
        {methodology?.stats.total_models ?? '—'} моделей рейтинга{' '}
        {detail.methodology_version || '—'}.
      </T>

      <style>{`
        @media (max-width: 899px) {
          .rt-detail-specs { padding: 28px 18px !important; }
          .rt-specs-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
          .rt-specs-source { align-items: flex-start !important; }
        }
      `}</style>
    </section>
  );
}

function groupsPlural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'группе';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'группах';
  return 'группах';
}

function SpecCard({ group }: { group: SpecGroup }) {
  return (
    <div
      style={{
        breakInside: 'avoid',
        border: '1px solid hsl(var(--rt-border-subtle))',
        borderRadius: 6,
        overflow: 'hidden',
        background: 'hsl(var(--rt-paper))',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          background: 'hsl(var(--rt-alt))',
          borderBottom: '1px solid hsl(var(--rt-border-subtle))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <T
          size={12}
          weight={600}
          mono
          style={{ textTransform: 'uppercase', letterSpacing: 1.2 }}
        >
          {group.group_display}
        </T>
        <T size={10} color="hsl(var(--rt-ink-40))" mono>
          {group.rows.length} парам.
        </T>
      </div>
      <div>
        {group.rows.map((r, i) => (
          <SpecRowView
            key={r.key}
            row={r}
            isLast={i === group.rows.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function SpecRowView({ row, isLast }: { row: SpecRow; isLast: boolean }) {
  const tickerColor =
    row.ticker === 'above'
      ? '#1f8f4c'
      : row.ticker === 'below'
        ? '#b24a3b'
        : null;
  const tickerChar = row.ticker === 'above' ? '▲' : row.ticker === 'below' ? '▼' : null;
  const valueLooksNumeric = /^[\d.\s−+−…\-]/.test(row.value) ||
    /(кВт|мм|кг|дБ|м²|%|°C|мин|г|мес|лет|год|м|Вт)$/.test(row.value);
  return (
    <div
      style={{
        padding: '11px 16px',
        borderBottom: isLast ? 0 : '1px solid hsl(var(--rt-border-subtle))',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 12,
        alignItems: 'baseline',
      }}
    >
      <T size={12} color="hsl(var(--rt-ink-60))" style={{ lineHeight: 1.4 }}>
        {row.name}
      </T>
      <div
        style={{
          textAlign: 'right',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'flex-end',
          gap: 6,
        }}
      >
        {tickerChar && tickerColor && (
          <span
            style={{
              fontSize: 9,
              fontFamily: 'var(--rt-font-mono)',
              color: tickerColor,
              letterSpacing: 0.3,
            }}
          >
            {tickerChar}
          </span>
        )}
        <T
          size={12}
          weight={600}
          mono={valueLooksNumeric}
          style={{ textAlign: 'right' }}
        >
          {row.value}
        </T>
      </div>
    </div>
  );
}
