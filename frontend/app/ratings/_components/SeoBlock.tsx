import { H, T } from './primitives';

const REASONS: Array<[string, string]> = [
  ['Прозрачная методика', 'оценка строится по понятным критериям и фиксированным весам'],
  ['Проверяемые данные', 'для параметров указываются источник и статус верификации'],
  [
    'Независимые измерения',
    'лабораторные показатели учитываются отдельно и влияют на итог',
  ],
  [
    'Детализация по модели',
    'можно увидеть не только итоговый индекс, но и вклад каждого параметра',
  ],
];

export default function SeoBlock() {
  return (
    <section
      style={{
        padding: '48px 40px 40px',
        borderTop: '1px solid hsl(var(--rt-border-subtle))',
      }}
      className="rt-seo"
    >
      <div style={{ maxWidth: 760 }}>
        <H
          size={26}
          serif
          as="h2"
          style={{ letterSpacing: -0.3, marginBottom: 16, lineHeight: 1.2 }}
        >
          Сравнивайте кондиционеры и сплит-системы не по рекламе, а по измеримым параметрам
        </H>
        <T
          size={14}
          color="hsl(var(--rt-ink-60))"
          style={{ lineHeight: 1.65, display: 'block', marginBottom: 24 }}
        >
          Мы рассчитываем интегральный индекс качества «Август-климат»: каждая модель
          получает итоговый балл на основе единой методики с весами критериев.
        </T>

        <H size={17} serif as="h3" style={{ letterSpacing: -0.2, marginBottom: 12, marginTop: 8 }}>
          Почему этому рейтингу можно доверять
        </H>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            marginBottom: 28,
          }}
        >
          {REASONS.map(([title, body]) => (
            <div
              key={title}
              style={{
                display: 'grid',
                gridTemplateColumns: '10px 1fr',
                gap: 12,
                alignItems: 'baseline',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 4,
                  height: 4,
                  background: 'hsl(var(--rt-accent))',
                  borderRadius: '50%',
                  marginTop: 7,
                }}
              />
              <T size={13} style={{ lineHeight: 1.6 }}>
                <span style={{ fontWeight: 600 }}>{title}</span>{' '}
                <span style={{ color: 'hsl(var(--rt-ink-60))' }}>— {body}</span>
              </T>
            </div>
          ))}
        </div>

        <H size={17} serif as="h3" style={{ letterSpacing: -0.2, marginBottom: 12 }}>
          Как читать рейтинг
        </H>
        <T
          size={14}
          color="hsl(var(--rt-ink-60))"
          style={{ lineHeight: 1.65, display: 'block', marginBottom: 20 }}
        >
          В таблице сплит-системы отсортированы по итоговому индексу. Можно включить режим
          «Самые тихие» для выбора по акустическому комфорту или собрать собственный
          рейтинг, отключив неважные для вас критерии.
        </T>

        <T
          size={14}
          color="hsl(var(--rt-ink))"
          style={{
            lineHeight: 1.65,
            fontStyle: 'italic',
            paddingLeft: 16,
            borderLeft: '3px solid hsl(var(--rt-accent))',
            display: 'block',
          }}
        >
          Этот рейтинг помогает быстро выбрать кондиционер или сплит-систему под ваши
          приоритеты — с опорой на данные, а не на маркетинговые обещания.
        </T>
      </div>
      <style>{`
        @media (max-width: 767px) {
          .rt-seo { padding: 32px 18px 28px !important; }
        }
      `}</style>
    </section>
  );
}
