import Image from 'next/image';
import type { HvacNews as NewsItem } from '@/lib/api/types/hvac';
import { Eyebrow, H, T } from '../../../rating-split-system/_components/primitives';
import {
  formatNewsDate,
  getNewsCategoryLabel,
  getNewsHeroImage,
  getNewsLede,
} from '../../../_components/newsHelpers';

// Внешние URL (из body) могут быть с не-настроенных доменов — используем
// unoptimized, чтобы не падать в next/image. priority всё равно даёт preload.
function isExternalUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

export default function NewsArticleHero({ news }: { news: NewsItem }) {
  const image = getNewsHeroImage(news);
  const category = getNewsCategoryLabel(news);
  const date = formatNewsDate(news.pub_date);
  const reading = news.reading_time_minutes ? `${news.reading_time_minutes} мин чтения` : null;
  const author = news.editorial_author;
  const sourceHost = (() => {
    if (!news.source_url) return null;
    try {
      return new URL(news.source_url).hostname;
    } catch {
      return null;
    }
  })();

  return (
    <header style={{ margin: '22px 0 24px' }} className="rt-article-hero">
      <div style={{ marginBottom: 10 }}>
        <Eyebrow>
          {[category, date, reading].filter(Boolean).join(' · ')}
        </Eyebrow>
      </div>

      <H
        as="h1"
        size={34}
        serif
        style={{
          letterSpacing: -0.8,
          lineHeight: 1.12,
        }}
        className="rt-article-h1"
      >
        {news.title}
      </H>

      <style>{`
        .rt-article-h1 { font-size: 40px; }
        @media (max-width: 639px) {
          .rt-article-h1 { font-size: 24px !important; letter-spacing: -0.4px !important; }
        }
      `}</style>

      <p
        style={{
          margin: '14px 0 0',
          fontFamily: 'var(--rt-font-serif)',
          fontSize: 15,
          lineHeight: 1.55,
          color: 'hsl(var(--rt-ink-60))',
        }}
      >
        {getNewsLede(news, 260)}
      </p>

      {author && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 18,
            paddingTop: 14,
            borderTop: '1px solid hsl(var(--rt-border-subtle))',
          }}
        >
          <AuthorAvatar author={author} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <T size={11} weight={600}>{author.name}</T>
            {author.role && (
              <div>
                <T size={10} color="hsl(var(--rt-ink-40))">{author.role}</T>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <GhostPill label="Поделиться" />
            <GhostPill label="Сохранить" />
          </div>
        </div>
      )}

      {image && (
        <figure style={{ margin: '24px 0 0' }}>
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16 / 9',
              maxHeight: 420,
              borderRadius: 4,
              overflow: 'hidden',
              background: 'hsl(var(--rt-alt))',
            }}
          >
            <Image
              src={image}
              alt={news.title}
              fill
              priority
              sizes="(max-width: 1023px) 100vw, 760px"
              unoptimized={isExternalUrl(image)}
              style={{ objectFit: 'cover', display: 'block' }}
            />
          </div>
          {sourceHost && (
            <figcaption
              style={{
                marginTop: 8,
                fontFamily: 'var(--rt-font-serif)',
                fontStyle: 'italic',
                fontSize: 12,
                color: 'hsl(var(--rt-ink-40))',
              }}
            >
              Фото: {sourceHost}
            </figcaption>
          )}
        </figure>
      )}
    </header>
  );
}

function AuthorAvatar({ author }: { author: NonNullable<NewsItem['editorial_author']> }) {
  const size = 28;
  if (author.avatar_url) {
    return (
      <Image
        src={author.avatar_url}
        alt={author.name}
        width={size}
        height={size}
        unoptimized={isExternalUrl(author.avatar_url)}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    );
  }
  const letter = (author.name || '·').trim().charAt(0).toUpperCase();
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'hsl(var(--rt-chip))',
        color: 'hsl(var(--rt-ink-60))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--rt-font-mono)',
        fontSize: 11,
        fontWeight: 500,
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
}

function GhostPill({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: '4px 10px',
        border: '1px solid hsl(var(--rt-border))',
        borderRadius: 14,
        fontSize: 11,
        color: 'hsl(var(--rt-ink-60))',
        cursor: 'default',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
