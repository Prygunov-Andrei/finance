import Link from 'next/link';
import type { RatingMethodologyStats } from '@/lib/api/types/rating';
import { Eyebrow, H, T } from './primitives';

const ABOUT_LINKS: Array<{ label: string; href: string; primary?: boolean }> = [
  { label: 'Как мы считаем', href: '/rating-split-system/methodology/', primary: true },
  { label: 'Архив моделей', href: '/rating-split-system/archive/' },
  { label: 'Добавить модель', href: '/rating-split-system/submit/' },
];

const AUTHORS: Array<{ name: string; role: string; photo: string }> = [
  {
    name: 'М. Савинов',
    role: 'главный редактор, автор методики',
    photo: '/rating-authors/savinov.jpg',
  },
  {
    name: 'А. Прыгунов',
    role: 'редактор',
    photo: '/rating-authors/prygunov.jpg',
  },
];

const DEFAULT_HERO_TITLE =
  'Интегральный индекс «Август-климат» качества бытовых кондиционеров до 4,5 кВт на основе наших измерений и анализа параметров';
const DEFAULT_HERO_EYEBROW = 'Независимый рейтинг · обновление 04.2026';

export default function HeroBlock({
  stats,
  title = DEFAULT_HERO_TITLE,
  eyebrow = DEFAULT_HERO_EYEBROW,
  intro,
}: {
  stats: RatingMethodologyStats;
  title?: string;
  eyebrow?: string;
  intro?: string;
}) {
  const numbers: Array<[number | string, string]> = [
    [stats.total_models, 'моделей'],
    [stats.active_criteria_count, 'критериев'],
    [4, 'года замеров'],
  ];
  return (
    <section
      style={{
        background: 'hsl(var(--rt-alt))',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
      }}
      className="rt-hero"
    >
      <div
        className="rt-hero-inner"
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '40px 40px 36px',
        }}
      >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 24,
          marginBottom: 22,
          flexWrap: 'wrap',
        }}
      >
        <Eyebrow>{eyebrow}</Eyebrow>
        <div style={{ display: 'flex', gap: 28, alignItems: 'baseline', flexWrap: 'wrap' }}>
          {numbers.map(([n, l]) => (
            <div key={l} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span
                style={{
                  fontFamily: 'var(--rt-font-serif)',
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: -0.5,
                  color: 'hsl(var(--rt-ink))',
                }}
              >
                {n}
              </span>
              <span style={{ fontSize: 11, color: 'hsl(var(--rt-ink-60))' }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rt-hero-grid">
        <div>
          <H size={34} serif as="h1" style={{ letterSpacing: -0.5, lineHeight: 1.2 }}>
            {title}
          </H>
          {intro && (
            <T
              size={14}
              color="hsl(var(--rt-ink-60))"
              style={{ marginTop: 14, lineHeight: 1.6, display: 'block', maxWidth: 640 }}
            >
              {intro}
            </T>
          )}
          <div
            style={{
              marginTop: 22,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Eyebrow style={{ marginRight: 6 }}>О рейтинге:</Eyebrow>
            {ABOUT_LINKS.map(({ label, href, primary }) => (
              <Link
                key={label}
                href={href}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 12px',
                  border: '1px solid hsl(var(--rt-border))',
                  borderRadius: 14,
                  fontSize: 11,
                  color: primary ? 'hsl(var(--rt-ink))' : 'hsl(var(--rt-ink-60))',
                  fontWeight: primary ? 600 : 500,
                  background: primary ? 'hsl(var(--rt-paper))' : 'transparent',
                  textDecoration: 'none',
                }}
              >
                {label}
                <span style={{ color: 'hsl(var(--rt-ink-40))', fontSize: 10 }}>→</span>
              </Link>
            ))}
          </div>
        </div>
        <AuthorsBlock />
      </div>
      </div>
      <style>{`
        .rt-hero-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 28px;
          align-items: start;
        }
        @media (min-width: 1024px) {
          .rt-hero-grid {
            grid-template-columns: 1fr 320px;
            gap: 48px;
          }
        }
        @media (max-width: 899px) {
          .rt-hero-inner { padding: 24px 20px 22px !important; }
        }
      `}</style>
    </section>
  );
}

function AuthorsBlock() {
  return (
    <div
      style={{
        borderLeft: '1px solid hsl(var(--rt-border))',
        paddingLeft: 22,
      }}
      className="rt-authors"
    >
      <Eyebrow style={{ display: 'block', marginBottom: 12 }}>Авторы методики</Eyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {AUTHORS.map(({ name, role, photo }) => (
          <div key={name} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt={name}
              width={44}
              height={44}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
                display: 'block',
              }}
            />
            <div style={{ minWidth: 0 }}>
              <T size={12} weight={600} style={{ letterSpacing: -0.1, display: 'block' }}>
                {name}
              </T>
              <T
                size={10}
                color="hsl(var(--rt-ink-60))"
                style={{ marginTop: 2, lineHeight: 1.35, display: 'block' }}
              >
                {role}
              </T>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HeroBlockCollapsed({ stats }: { stats: RatingMethodologyStats }) {
  const numbers: Array<[number | string, string]> = [
    [stats.total_models, 'моделей'],
    [stats.active_criteria_count, 'критериев'],
    [4, 'года'],
  ];
  return (
    <section
      style={{
        background: 'hsl(var(--rt-alt))',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
      }}
      className="rt-hero-collapsed"
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '12px 40px',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          flexWrap: 'nowrap',
          overflow: 'hidden',
        }}
      >
        <Eyebrow style={{ flexShrink: 0 }}>
          Рейтинг кондиционеров «Август-климат» · 04.2026
        </Eyebrow>
        <div
          style={{
            display: 'flex',
            gap: 18,
            alignItems: 'baseline',
            flex: 1,
            minWidth: 0,
          }}
        >
          {numbers.map(([n, l]) => (
            <div key={l} style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
              <span
                style={{
                  fontFamily: 'var(--rt-font-serif)',
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: -0.4,
                  color: 'hsl(var(--rt-ink))',
                }}
              >
                {n}
              </span>
              <span style={{ fontSize: 10, color: 'hsl(var(--rt-ink-60))' }}>{l}</span>
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexShrink: 0,
          }}
          className="rt-hero-collapsed-authors"
        >
          {AUTHORS.map(({ name, photo }) => (
            <div key={name} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo}
                alt={name}
                width={24}
                height={24}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'hsl(var(--rt-ink-60))',
                  whiteSpace: 'nowrap',
                }}
              >
                {name.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @media (max-width: 899px) {
          .rt-hero-collapsed-authors { display: none !important; }
        }
      `}</style>
    </section>
  );
}
