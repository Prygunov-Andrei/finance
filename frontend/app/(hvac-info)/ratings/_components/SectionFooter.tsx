import Link from 'next/link';
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
        borderTop: '1px solid hsl(var(--rt-border-subtle))',
        background: 'hsl(var(--rt-alt))',
      }}
      className="rt-section-footer"
    >
      <div
        className="rt-section-footer-inner"
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '32px 40px',
        }}
      >
        <Eyebrow style={{ display: 'block', marginBottom: 14 }}>О рейтинге</Eyebrow>
        <div className="rt-section-footer-row">
          <div className="rt-section-footer-links">
            {LINKS.map(([label, href]) => (
              <Link
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
              </Link>
            ))}
          </div>
          <Link
            href="/login/"
            className="rt-section-footer-login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              background: 'hsl(var(--rt-ink))',
              color: 'hsl(var(--rt-paper))',
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              letterSpacing: -0.1,
            }}
          >
            Вход
            <span aria-hidden style={{ fontSize: 12 }}>→</span>
          </Link>
        </div>
      </div>
      <style>{`
        .rt-section-footer-row {
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: flex-start;
        }
        .rt-section-footer-links {
          display: flex;
          flex-direction: column;
        }
        .rt-section-footer-links > a + a {
          border-top: 1px solid hsl(var(--rt-border-subtle));
        }
        @media (min-width: 768px) {
          .rt-section-footer-row {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            gap: 24px;
          }
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
          .rt-section-footer-inner { padding: 24px 18px 28px !important; }
          .rt-section-footer-login {
            align-self: stretch;
            justify-content: center;
          }
        }
      `}</style>
    </footer>
  );
}
