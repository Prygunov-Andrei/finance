import type { RatingMethodology } from '@/lib/api/types/rating';

type Props = {
  stats: RatingMethodology['stats'];
  criteriaCount: number;
  version: string;
  weightSum: number;
};

export default function MethodologyHero({ criteriaCount, version, weightSum }: Props) {
  const miniStats: Array<[string, string | number]> = [
    ['Критериев', criteriaCount],
    ['Сумма весов', `${Math.round(weightSum)}%`],
    ['Версия', version || 'v1.0'],
  ];
  return (
    <section
      className="rt-methodology-hero"
      style={{
        background: 'hsl(var(--rt-alt))',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
      }}
    >
      <div
        className="rt-methodology-hero-inner"
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '40px 56px 28px',
          display: 'grid',
          gridTemplateColumns: '1fr 300px',
          gap: 48,
          alignItems: 'end',
        }}
      >
        <div>
          <p
            style={{
              fontFamily: 'var(--rt-font-mono)',
              fontSize: 10,
              fontWeight: 500,
              color: 'hsl(var(--rt-ink-40))',
              textTransform: 'uppercase',
              letterSpacing: 1.4,
              margin: 0,
            }}
          >
            Методика рейтинга · {version || 'v1.0'}
          </p>
          <h1
            style={{
              fontFamily: 'var(--rt-font-serif)',
              fontSize: 42,
              fontWeight: 600,
              letterSpacing: -0.8,
              lineHeight: 1.1,
              margin: '10px 0 0',
              maxWidth: 640,
            }}
          >
            Как мы считаем индекс «Август-климат»
          </h1>
          <p
            style={{
              fontFamily: 'var(--rt-font-serif)',
              fontSize: 14,
              lineHeight: 1.65,
              color: 'hsl(var(--rt-ink-60))',
              margin: '14px 0 0',
              maxWidth: 620,
            }}
          >
            Интегральный индекс — взвешенная сумма {criteriaCount} параметров.
            Каждый параметр оценивается по своей шкале (числовой с границами,
            бинарной «есть/нет» или категориальной). Сумма весов — ровно 100%.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {miniStats.map(([k, v]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingBottom: 8,
                borderBottom: '1px solid hsl(var(--rt-border-subtle))',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--rt-font-mono)',
                  fontSize: 11,
                  color: 'hsl(var(--rt-ink-60))',
                  textTransform: 'uppercase',
                  letterSpacing: 1.2,
                }}
              >
                {k}
              </span>
              <span
                style={{
                  fontFamily: 'var(--rt-font-serif)',
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: -0.5,
                }}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @media (max-width: 899px) {
          .rt-methodology-hero-inner {
            grid-template-columns: 1fr !important;
            padding: 28px 20px 20px !important;
            gap: 24px !important;
          }
          .rt-methodology-hero-inner h1 { font-size: 30px !important; }
        }
      `}</style>
    </section>
  );
}

export function MethodologyHeroCollapsed({ criteriaCount, version, weightSum }: Props) {
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
          padding: '12px 40px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--rt-font-mono)',
            fontSize: 10,
            color: 'hsl(var(--rt-ink-40))',
            textTransform: 'uppercase',
            letterSpacing: 1.4,
          }}
        >
          Методика · {version || 'v1.0'}
        </span>
        <span
          style={{
            fontFamily: 'var(--rt-font-serif)',
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: -0.3,
            color: 'hsl(var(--rt-ink))',
          }}
        >
          Как мы считаем индекс
        </span>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 11,
            color: 'hsl(var(--rt-ink-60))',
            fontFamily: 'var(--rt-font-mono)',
            letterSpacing: 0.5,
          }}
        >
          {criteriaCount} критериев · {Math.round(weightSum)}%
        </span>
      </div>
    </section>
  );
}
