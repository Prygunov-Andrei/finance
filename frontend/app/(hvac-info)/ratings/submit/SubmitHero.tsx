const STEPS = [
  'Заполните форму ниже — укажите бренд, модель и контактные данные.',
  'Подтвердите результаты измерений фото- или видеоматериалами.',
  'При необходимости мы свяжемся с вами для уточнения деталей.',
  'После проверки результаты появятся в рейтинге — с измерениями и итоговым индексом.',
];

export default function SubmitHero() {
  return (
    <section
      style={{
        background: 'hsl(var(--rt-alt))',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
      }}
      className="rt-submit-hero"
    >
      <div
        className="rt-submit-hero-inner"
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '40px 40px 36px',
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
          Заявка
        </p>
        <h1
          style={{
            fontFamily: 'var(--rt-font-serif)',
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: -0.5,
            margin: '8px 0 0',
            maxWidth: 820,
          }}
        >
          Добавить новый кондиционер в рейтинг
        </h1>
        <p
          style={{
            fontFamily: 'var(--rt-font-serif)',
            fontSize: 13,
            lineHeight: 1.65,
            color: 'hsl(var(--rt-ink-60))',
            margin: '12px 0 0',
            maxWidth: 720,
          }}
        >
          Хотите, чтобы ваш кондиционер попал в независимый рейтинг
          «Август-климат»? Выполните объективные замеры комплектующих и функционала
          и пришлите их нам.
        </p>

        <div
          style={{
            marginTop: 22,
            padding: '18px 20px',
            background: 'hsl(var(--rt-paper))',
            borderRadius: 4,
            border: '1px solid hsl(var(--rt-border-subtle))',
            maxWidth: 720,
          }}
        >
          <p
            style={{
              fontFamily: 'var(--rt-font-mono)',
              fontSize: 11,
              color: 'hsl(var(--rt-ink-40))',
              textTransform: 'uppercase',
              letterSpacing: 1.2,
              margin: 0,
              marginBottom: 10,
            }}
          >
            Как это работает
          </p>
          {STEPS.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0' }}>
              <span
                style={{
                  fontFamily: 'var(--rt-font-mono)',
                  fontSize: 11,
                  color: 'hsl(var(--rt-accent))',
                  fontWeight: 600,
                  width: 18,
                  flexShrink: 0,
                }}
              >
                {i + 1}.
              </span>
              <span
                style={{
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: 'hsl(var(--rt-ink-80))',
                }}
              >
                {t}
              </span>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @media (max-width: 899px) {
          .rt-submit-hero-inner { padding: 28px 20px 24px !important; }
          .rt-submit-hero-inner h1 { font-size: 24px !important; }
        }
      `}</style>
    </section>
  );
}
