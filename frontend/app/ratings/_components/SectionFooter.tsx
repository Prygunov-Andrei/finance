import { Eyebrow, T } from './primitives';

const GROUPS: Array<[string, Array<[string, string]>]> = [
  [
    'Прозрачность',
    [
      ['Методика рейтинга', '#'],
      ['Веса критериев', '#'],
      ['История изменений', '#'],
    ],
  ],
  [
    'Участие',
    [
      ['Добавить модель', '/ratings/submit/'],
      ['Сообщить о замерах', '#'],
      ['Для производителей', '#'],
    ],
  ],
  [
    'Архив',
    [
      ['Модели 2023', '#'],
      ['Модели 2022', '#'],
      ['Снятые с производства', '/ratings/archive/'],
    ],
  ],
];

export default function SectionFooter() {
  return (
    <footer
      style={{
        padding: '32px 40px',
        borderTop: '1px solid hsl(var(--rt-border-subtle))',
        background: 'hsl(var(--rt-alt))',
      }}
      className="rt-section-footer"
    >
      <div className="rt-section-footer-grid">
        {GROUPS.map(([group, links]) => (
          <div key={group}>
            <Eyebrow style={{ display: 'block', marginBottom: 10 }}>{group}</Eyebrow>
            <div className="rt-section-footer-links">
              {links.map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    color: 'hsl(var(--rt-ink))',
                    textDecoration: 'none',
                    fontSize: 13,
                  }}
                >
                  <T size={13}>{label}</T>
                  <span style={{ color: 'hsl(var(--rt-ink-40))', fontSize: 12 }}>→</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <style>{`
        .rt-section-footer-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
        }
        .rt-section-footer-links {
          display: flex;
          flex-direction: column;
        }
        .rt-section-footer-links > a + a {
          border-top: 1px solid hsl(var(--rt-border-subtle));
        }
        @media (min-width: 768px) {
          .rt-section-footer { padding: 32px 40px !important; }
          .rt-section-footer-grid {
            grid-template-columns: 1fr 1fr 1fr;
            gap: 40px;
          }
          .rt-section-footer-links {
            gap: 6px;
          }
          .rt-section-footer-links > a {
            padding: 0 !important;
            color: hsl(var(--rt-ink-60)) !important;
          }
          .rt-section-footer-links > a + a {
            border-top: 0;
          }
        }
        @media (max-width: 767px) {
          .rt-section-footer { padding: 24px 18px 28px !important; }
        }
      `}</style>
    </footer>
  );
}
