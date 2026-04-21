import Link from 'next/link';
import type { RatingMethodologyStats } from '@/lib/api/types/rating';
import { Eyebrow, H, T } from './primitives';

const ABOUT_LINKS: Array<{ label: string; href: string; primary?: boolean }> = [
  { label: 'Как мы считаем', href: '/ratings/methodology/', primary: true },
  { label: 'Архив моделей', href: '/ratings/archive/' },
  { label: 'Добавить модель', href: '/ratings/submit/' },
];

const AUTHORS: Array<[string, string]> = [
  ['Андрей Петров', 'главный редактор, инженер-теплотехник'],
  ['Ирина Соколова', 'лаборатория акустики, к. т. н.'],
];

export default function HeroBlock({ stats }: { stats: RatingMethodologyStats }) {
  const numbers: Array<[number | string, string]> = [
    [stats.total_models, 'моделей'],
    [stats.active_criteria_count, 'критериев'],
    [4, 'года замеров'],
  ];
  return (
    <section
      style={{
        padding: '40px 40px 36px',
        background: 'hsl(var(--rt-alt))',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
      }}
      className="rt-hero"
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
        <Eyebrow>Независимый рейтинг · обновление 04.2026</Eyebrow>
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
            Интегральный индекс «Август-климат» качества бытовых кондиционеров до 4,0 кВт на
            основе наших измерений и анализа параметров.
          </H>
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
        {AUTHORS.map(([name, role]) => (
          <div key={name} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'hsl(var(--rt-chip))',
                overflow: 'hidden',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              <svg width="44" height="44" viewBox="0 0 44 44" style={{ display: 'block' }} aria-hidden>
                <circle cx="22" cy="17" r="7" fill="hsl(var(--rt-ink-40))" opacity="0.5" />
                <path
                  d="M 8 44 Q 8 30 22 30 Q 36 30 36 44 Z"
                  fill="hsl(var(--rt-ink-40))"
                  opacity="0.5"
                />
              </svg>
            </div>
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
