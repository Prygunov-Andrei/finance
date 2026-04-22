type Props = {
  count: number;
};

export default function ArchiveHero({ count }: Props) {
  return (
    <section
      className="rt-archive-hero"
      style={{
        background: 'hsl(var(--rt-alt))',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
      }}
    >
      <div
        className="rt-archive-hero-inner"
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '28px 40px 24px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div>
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
            Архив моделей
          </p>
          <h1
            style={{
              fontFamily: 'var(--rt-font-serif)',
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: -0.4,
              margin: '6px 0 0',
            }}
          >
            Модели, выбывшие из рейтинга
          </h1>
        </div>
        <p
          style={{
            fontFamily: 'var(--rt-font-serif)',
            fontSize: 12,
            lineHeight: 1.55,
            color: 'hsl(var(--rt-ink-60))',
            maxWidth: 480,
            margin: 0,
          }}
        >
          Здесь — кондиционеры, которые раньше участвовали в рейтинге, но были
          исключены: снятие с производства, уход бренда с рынка РФ, отсутствие в
          продаже. Карточки сохраняются со всеми замерами и последним индексом.
        </p>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--rt-font-serif)',
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: -0.6,
            }}
            data-testid="archive-count"
          >
            {count}
          </span>
          <span
            style={{
              fontFamily: 'var(--rt-font-mono)',
              fontSize: 11,
              color: 'hsl(var(--rt-ink-60))',
              textTransform: 'uppercase',
              letterSpacing: 1.2,
              lineHeight: 1.3,
            }}
          >
            моделей
            <br />в архиве
          </span>
        </div>
      </div>
      <style>{`
        @media (max-width: 899px) {
          .rt-archive-hero-inner {
            padding: 24px 20px 20px !important;
            gap: 12px !important;
          }
          .rt-archive-hero-inner h1 { font-size: 22px !important; }
        }
      `}</style>
    </section>
  );
}

export function ArchiveHeroCollapsed({ count }: Props) {
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
          gap: 16,
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
          Архив
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
          Модели, выбывшие из рейтинга
        </span>
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: 'var(--rt-font-mono)',
            fontSize: 11,
            color: 'hsl(var(--rt-ink-60))',
            letterSpacing: 0.5,
          }}
        >
          {count} в архиве
        </span>
      </div>
    </section>
  );
}
