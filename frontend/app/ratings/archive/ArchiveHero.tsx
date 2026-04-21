type Props = {
  count: number;
};

export default function ArchiveHero({ count }: Props) {
  return (
    <section
      className="rt-archive-hero"
      style={{
        padding: '28px 40px 18px',
        maxWidth: 1280,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'baseline',
        gap: 24,
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
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
      <style>{`
        @media (max-width: 899px) {
          .rt-archive-hero {
            padding: 24px 20px 16px !important;
            gap: 12px !important;
          }
          .rt-archive-hero h1 { font-size: 22px !important; }
        }
      `}</style>
    </section>
  );
}
