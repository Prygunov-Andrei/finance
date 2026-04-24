import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { Eyebrow, T } from '../ratings/_components/primitives';

const RATING_LINKS: Array<[string, string]> = [
  ['Как мы считаем', '/ratings/methodology/'],
  ['Архив моделей', '/ratings/archive/'],
  ['Добавить модель', '/ratings/submit/'],
];

const NEWS_STUBS = ['Прислать новость'];
const MISC_STUBS = ['Контакты', 'Нашли ошибку?'];

const linkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 0',
  color: 'hsl(var(--rt-ink))',
  textDecoration: 'none',
  fontSize: 13,
};

const stubStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 0',
  color: 'hsl(var(--rt-ink-40))',
  fontSize: 13,
  fontFamily: 'var(--rt-font-sans)',
  cursor: 'default',
};

function FooterStub({ label }: { label: string }) {
  return (
    <span
      className="rt-section-footer-stub"
      style={stubStyle}
      title="Скоро"
      aria-disabled="true"
    >
      <T size={13} color="hsl(var(--rt-ink-40))">
        {label}
      </T>
      <span style={{ fontSize: 10, opacity: 0.6, letterSpacing: 0.4 }}>
        скоро
      </span>
    </span>
  );
}

function FooterColumn({
  heading,
  children,
}: {
  heading?: string;
  children: ReactNode;
}) {
  return (
    <div className="rt-section-footer-col">
      {heading ? (
        <Eyebrow style={{ display: 'block', marginBottom: 14 }}>
          {heading}
        </Eyebrow>
      ) : (
        <span
          aria-hidden
          className="rt-section-footer-col-spacer"
          style={{ display: 'block', marginBottom: 14, height: 12 }}
        />
      )}
      <div className="rt-section-footer-links">{children}</div>
    </div>
  );
}

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
        <div className="rt-section-footer-grid">
          <FooterColumn heading="О рейтинге">
            {RATING_LINKS.map(([label, href]) => (
              <Link key={label} href={href} style={linkStyle}>
                <T size={13}>{label}</T>
                <span style={{ color: 'hsl(var(--rt-ink-40))', fontSize: 12 }}>
                  →
                </span>
              </Link>
            ))}
          </FooterColumn>

          <FooterColumn heading="Новости">
            {NEWS_STUBS.map((label) => (
              <FooterStub key={label} label={label} />
            ))}
          </FooterColumn>

          <FooterColumn>
            {MISC_STUBS.map((label) => (
              <FooterStub key={label} label={label} />
            ))}
          </FooterColumn>
        </div>

        <div className="rt-section-footer-login-row">
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
            <span aria-hidden style={{ fontSize: 12 }}>
              →
            </span>
          </Link>
        </div>
      </div>
      <style>{`
        .rt-section-footer-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 32px;
          align-items: start;
        }
        .rt-section-footer-col {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .rt-section-footer-links {
          display: flex;
          flex-direction: column;
        }
        .rt-section-footer-login-row {
          display: flex;
          justify-content: flex-end;
          margin-top: 24px;
        }
        @media (max-width: 767px) {
          .rt-section-footer-inner { padding: 24px 18px 28px !important; }
          .rt-section-footer-grid {
            grid-template-columns: 1fr;
            gap: 24px;
          }
          .rt-section-footer-links > a + a,
          .rt-section-footer-links > span + span {
            border-top: 1px solid hsl(var(--rt-border-subtle));
          }
          .rt-section-footer-login-row {
            justify-content: stretch;
          }
          .rt-section-footer-login {
            align-self: stretch;
            justify-content: center;
            flex: 1;
          }
        }
      `}</style>
    </footer>
  );
}
