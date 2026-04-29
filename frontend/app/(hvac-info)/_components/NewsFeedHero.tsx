import Image from 'next/image';
import Link from 'next/link';
import type { HvacNews as NewsItem } from '@/lib/api/types/hvac';
import { Eyebrow, H, Pill, T } from '../rating-split-system/_components/primitives';
import {
  formatNewsDate,
  formatNewsDateShort,
  getNewsCategoryLabel,
  getNewsHeroImage,
  getNewsLede,
} from './newsHelpers';

// Внешние URL (из body) могут быть с не-настроенных доменов — используем
// unoptimized, чтобы не падать в next/image. priority всё равно даёт preload.
function isExternalUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

export default function NewsFeedHero({ items }: { items: NewsItem[] }) {
  if (items.length === 0) return null;
  const hero = items[0];
  const side = items.slice(1, 5);
  const heroImage = getNewsHeroImage(hero);
  const hasImage = Boolean(heroImage);

  return (
    <section
      style={{
        padding: '28px 40px 14px',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
      }}
      className="rt-feed-hero"
    >
      <div style={{ marginBottom: 18 }}>
        <Eyebrow>Новости отрасли</Eyebrow>
        <H
          size={30}
          serif
          as="h1"
          style={{ marginTop: 4, letterSpacing: -0.5 }}
        >
          Сегодня, {formatNewsDate(new Date().toISOString())}
        </H>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr',
          gap: 36,
        }}
        className="rt-feed-hero-grid"
      >
        <Link
          href={`/news/${hero.id}`}
          data-no-image={hasImage ? undefined : 'true'}
          className="rt-feed-hero-link"
          style={{
            display: 'block',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          {hasImage && heroImage && (
            <div
              className="rt-feed-hero-img"
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16 / 9',
                borderRadius: 4,
                marginBottom: 14,
                overflow: 'hidden',
                background: 'hsl(var(--rt-alt))',
              }}
            >
              <Image
                src={heroImage}
                alt=""
                aria-hidden
                fill
                priority
                sizes="(max-width: 1023px) 100vw, 60vw"
                unoptimized={isExternalUrl(heroImage)}
                style={{ objectFit: 'cover' }}
              />
            </div>
          )}
          <div style={{ marginBottom: 10 }}>
            <Pill style={{ background: 'hsl(var(--rt-accent-bg))', color: 'hsl(var(--rt-accent))', borderColor: 'hsl(var(--rt-accent))' }}>
              {getNewsCategoryLabel(hero)} · {formatNewsDateShort(hero.pub_date)}
            </Pill>
          </div>
          <H
            size={hasImage ? 26 : 34}
            serif
            style={{ letterSpacing: -0.4, textWrap: 'balance' } as React.CSSProperties}
            className="rt-feed-hero-h2"
          >
            {hero.title}
          </H>
          <p
            style={{
              margin: '10px 0 0',
              fontSize: hasImage ? 14 : 16,
              lineHeight: 1.55,
              color: 'hsl(var(--rt-ink-60))',
              maxWidth: 580,
            }}
          >
            {getNewsLede(hero, hasImage ? 220 : 320)}
          </p>
        </Link>

        <aside>
          <Eyebrow>Рядом</Eyebrow>
          <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {side.map((item) => (
              <li key={item.id} style={{ borderBottom: '1px solid hsl(var(--rt-border-subtle))', paddingBottom: 12 }}>
                <Link
                  href={`/news/${item.id}`}
                  style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                >
                  <T
                    size={10}
                    mono
                    color="hsl(var(--rt-ink-40))"
                    style={{ letterSpacing: 1, textTransform: 'uppercase' }}
                  >
                    {formatNewsDateShort(item.pub_date)} · {getNewsCategoryLabel(item)}
                  </T>
                  <div style={{ marginTop: 4 }}>
                    <T size={14} weight={500} style={{ lineHeight: 1.3 }}>
                      {item.title}
                    </T>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <style>{`
        @media (max-width: 1023px) {
          .rt-feed-hero { padding: 20px 16px 8px !important; }
          .rt-feed-hero-grid { grid-template-columns: 1fr !important; gap: 20px !important; }
          .rt-feed-hero-h2 { font-size: 22px !important; }
          .rt-feed-hero-link[data-no-image="true"] .rt-feed-hero-h2 { font-size: 24px !important; }
        }
      `}</style>
    </section>
  );
}
