import Link from 'next/link';

import type { RatingModelListItem } from '@/lib/api/types/rating';

type Props = {
  models: RatingModelListItem[];
};

export default function ArchiveTable({ models }: Props) {
  if (models.length === 0) {
    return (
      <section
        className="rt-archive-body"
        style={{
          padding: '32px 40px 60px',
          maxWidth: 1280,
          margin: '0 auto',
        }}
      >
        <div
          data-testid="archive-empty"
          style={{
            padding: 40,
            textAlign: 'center',
            background: 'hsl(var(--rt-alt))',
            borderRadius: 4,
          }}
        >
          <p
            style={{
              fontFamily: 'var(--rt-font-mono)',
              fontSize: 10,
              color: 'hsl(var(--rt-ink-40))',
              textTransform: 'uppercase',
              letterSpacing: 1.4,
              margin: 0,
            }}
          >
            Архив пуст
          </p>
          <p
            style={{
              fontSize: 14,
              color: 'hsl(var(--rt-ink-60))',
              margin: '10px 0 0',
              lineHeight: 1.55,
              maxWidth: 480,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            В архиве пока нет моделей. Когда модель перестаёт быть актуальной,
            она переносится сюда со всеми замерами и индексом.
          </p>
        </div>
      </section>
    );
  }

  const sorted = [...models].sort((a, b) => b.total_index - a.total_index);

  return (
    <section
      className="rt-archive-body"
      style={{
        padding: '20px 40px 60px',
        maxWidth: 1280,
        margin: '0 auto',
      }}
    >
      <div
        style={{
          marginTop: 10,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--rt-font-mono)',
            fontSize: 11,
            color: 'hsl(var(--rt-ink-40))',
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            marginRight: 6,
          }}
        >
          Сортировка:
        </span>
        <span
          style={{
            padding: '5px 10px',
            fontSize: 11,
            fontWeight: 500,
            background: 'hsl(var(--rt-ink))',
            color: 'hsl(var(--rt-paper))',
            borderRadius: 3,
          }}
        >
          По индексу ↓
        </span>
      </div>

      <div
        className="rt-archive-table"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 2fr 80px 30px',
          padding: '8px 0',
          borderBottom: '1px solid hsl(var(--rt-ink-15))',
          gap: 12,
        }}
      >
        {['Бренд', 'Модель', 'Индекс', ''].map((h, idx) => (
          <span
            key={idx}
            style={{
              fontFamily: 'var(--rt-font-mono)',
              fontSize: 10,
              color: 'hsl(var(--rt-ink-40))',
              textTransform: 'uppercase',
              letterSpacing: 1.2,
              textAlign: idx === 2 ? 'right' : 'left',
            }}
          >
            {h}
          </span>
        ))}
      </div>

      {sorted.map((m, i) => (
        <Link
          key={m.id}
          href={`/ratings/${m.slug}/`}
          className="rt-archive-row"
          data-testid="archive-row"
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 2fr 80px 30px',
            padding: '12px 0',
            borderBottom:
              i < sorted.length - 1
                ? '1px solid hsl(var(--rt-border-subtle))'
                : 'none',
            gap: 12,
            alignItems: 'center',
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--rt-font-mono)',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.5,
            }}
          >
            {m.brand}
          </span>
          <span style={{ fontSize: 12 }}>{m.inner_unit}</span>
          <span
            style={{
              fontFamily: 'var(--rt-font-mono)',
              fontSize: 12,
              fontWeight: 600,
              color: 'hsl(var(--rt-ink-40))',
              textAlign: 'right',
            }}
          >
            {m.total_index.toFixed(1)}
          </span>
          <span
            aria-hidden
            style={{
              fontSize: 14,
              color: 'hsl(var(--rt-ink-40))',
              textAlign: 'center',
            }}
          >
            →
          </span>
        </Link>
      ))}

      <style>{`
        @media (max-width: 899px) {
          .rt-archive-body {
            padding: 16px 20px 48px !important;
          }
          .rt-archive-table { display: none !important; }
          .rt-archive-row {
            grid-template-columns: 1fr auto 24px !important;
            grid-template-rows: auto auto !important;
            row-gap: 4px !important;
          }
          .rt-archive-row > :nth-child(1) {
            grid-column: 1 / 2;
            grid-row: 1;
          }
          .rt-archive-row > :nth-child(2) {
            grid-column: 1 / 4;
            grid-row: 2;
            font-size: 13px !important;
          }
          .rt-archive-row > :nth-child(3) {
            grid-column: 2 / 3;
            grid-row: 1;
            text-align: right !important;
          }
          .rt-archive-row > :nth-child(4) {
            grid-column: 3 / 4;
            grid-row: 1;
          }
        }
      `}</style>
    </section>
  );
}
