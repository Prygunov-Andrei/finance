import { Eyebrow, T } from './primitives';

const LINKS: Array<[string, string]> = [
  ['Как мы считаем', '/ratings/methodology/'],
  ['Архив моделей', '/ratings/archive/'],
  ['Добавить модель', '/ratings/submit/'],
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
      <Eyebrow style={{ display: 'block', marginBottom: 14 }}>О рейтинге</Eyebrow>
      <div className="rt-section-footer-links">
        {LINKS.map(([label, href]) => (
          <a
            key={label}
            href={href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
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
      <style>{`
        .rt-section-footer-links {
          display: flex;
          flex-direction: column;
        }
        .rt-section-footer-links > a + a {
          border-top: 1px solid hsl(var(--rt-border-subtle));
        }
        @media (min-width: 768px) {
          .rt-section-footer { padding: 32px 40px !important; }
          .rt-section-footer-links {
            flex-direction: row;
            gap: 24px;
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
