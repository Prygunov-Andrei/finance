import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { Eyebrow, T } from '../rating-split-system/_components/primitives';

const RATING_LINKS: Array<[string, string]> = [
  ['Как мы считаем', '/rating-split-system/methodology/'],
  ['Архив моделей', '/rating-split-system/archive/'],
  ['Добавить модель', '/rating-split-system/submit/'],
];

/** Wave 10.4 P3.4: внутренняя перелинковка с подвала на популярные landing'и
 *  (price, preset, каталоги). У главной не было прямых ссылок на эти разделы —
 *  Максим в SEO-аудите 28.04.2026 пометил это как причину низкого CTR. */
const BUDGET_LINKS: Array<[string, string]> = [
  ['До 20 000 ₽', '/price/do-20000-rub'],
  ['До 30 000 ₽', '/price/do-30000-rub'],
  ['До 40 000 ₽', '/price/do-40000-rub'],
  ['До 50 000 ₽', '/price/do-50000-rub'],
  ['До 60 000 ₽', '/price/do-60000-rub'],
];

const REQUIREMENT_LINKS: Array<[string, string]> = [
  ['Тихие', '/quiet'],
  ['Для холодного климата', '/rating-split-system/preset/cold'],
  ['Бюджетные', '/rating-split-system/preset/budget'],
  ['Для частного дома', '/rating-split-system/preset/house'],
  ['Для аллергиков', '/rating-split-system/preset/allergy'],
];

const CATALOG_LINKS: Array<[string, string]> = [
  ['Бренды', '/brands'],
  ['Производители', '/manufacturers'],
  ['Ресурсы', '/resources'],
];

const NEWS_STUBS = ['Прислать новость'];
const MISC_STUBS = ['Контакты', 'Нашли ошибку?'];

/** Ссылки для поисковиков и AI-агентов. Все 4 файла лежат на проде в корне
 *  домена (200 OK по прямым URL) — здесь делаем их видимыми в подвале, чтобы
 *  крауллеры могли подняться от страницы к этим файлам без угадывания путей. */
const SEO_AGENT_LINKS: Array<[string, string]> = [
  ['robots.txt', '/robots.txt'],
  ['sitemap.xml', '/sitemap.xml'],
  ['llms.txt', '/llms.txt'],
  ['llms-full.txt', '/llms-full.txt'],
];

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

        <div
          className="rt-section-footer-grid rt-section-footer-grid-secondary"
          style={{ marginTop: 28 }}
        >
          <FooterColumn heading="Подобрать по бюджету">
            {BUDGET_LINKS.map(([label, href]) => (
              <Link key={href} href={href} style={linkStyle}>
                <T size={13}>{label}</T>
                <span style={{ color: 'hsl(var(--rt-ink-40))', fontSize: 12 }}>
                  →
                </span>
              </Link>
            ))}
          </FooterColumn>

          <FooterColumn heading="Подобрать по требованиям">
            {REQUIREMENT_LINKS.map(([label, href]) => (
              <Link key={href} href={href} style={linkStyle}>
                <T size={13}>{label}</T>
                <span style={{ color: 'hsl(var(--rt-ink-40))', fontSize: 12 }}>
                  →
                </span>
              </Link>
            ))}
          </FooterColumn>

          <FooterColumn heading="Каталоги">
            {CATALOG_LINKS.map(([label, href]) => (
              <Link key={href} href={href} style={linkStyle}>
                <T size={13}>{label}</T>
                <span style={{ color: 'hsl(var(--rt-ink-40))', fontSize: 12 }}>
                  →
                </span>
              </Link>
            ))}
          </FooterColumn>
        </div>

        <div className="rt-section-footer-login-row">
          <ul
            className="rt-section-footer-seo-links"
            aria-label="Файлы для поисковых и AI-агентов"
          >
            {SEO_AGENT_LINKS.map(([label, href]) => (
              <li key={href}>
                <a href={href} className="rt-section-footer-seo-link">
                  {label}
                </a>
              </li>
            ))}
          </ul>
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
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-top: 24px;
          flex-wrap: wrap;
        }
        .rt-section-footer-seo-links {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
        }
        .rt-section-footer-seo-link {
          font-size: 11px;
          font-family: var(--rt-font-mono);
          color: hsl(var(--rt-ink-60));
          text-decoration: none;
          letter-spacing: 0.2px;
        }
        .rt-section-footer-seo-link:hover {
          color: hsl(var(--rt-ink));
          text-decoration: underline;
        }
        @media (max-width: 767px) {
          .rt-section-footer-inner { padding: 24px 18px 28px !important; }
          .rt-section-footer-grid {
            grid-template-columns: 1fr;
            gap: 24px;
          }
          /* Polish 2.2 B5: на мобиле колонка «прочее» без заголовка не нуждается
             в spacer'е высотой 12px, который на десктопе нужен только для
             выравнивания grid-колонок по нижнему краю heading'ов. */
          .rt-section-footer-col-spacer { display: none !important; }
          .rt-section-footer-links > a + a,
          .rt-section-footer-links > span + span {
            border-top: 1px solid hsl(var(--rt-border-subtle));
          }
          .rt-section-footer-login-row {
            justify-content: stretch;
            flex-direction: column;
            align-items: stretch;
            gap: 18px;
          }
          .rt-section-footer-seo-links {
            justify-content: center;
            gap: 12px 18px;
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
