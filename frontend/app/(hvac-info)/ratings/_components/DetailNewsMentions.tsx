import Link from 'next/link';
import type { RatingNewsMention } from '@/lib/api/types/rating';
import { Eyebrow, H, T } from './primitives';
import { formatNewsDate } from '../../_components/newsHelpers';
import { pluralize } from '@/lib/utils';

export default function DetailNewsMentions({
  mentions,
}: {
  mentions: RatingNewsMention[] | undefined | null;
}) {
  if (!mentions || mentions.length === 0) return null;

  const count = mentions.length;
  const plural = pluralize(count, ['новость', 'новости', 'новостей']);

  return (
    <section
      data-anchor="mentions"
      style={{
        padding: '40px',
        borderTop: '1px solid hsl(var(--rt-border-subtle))',
      }}
      className="rt-section-mentions"
    >
      <Eyebrow>Упоминания в прессе</Eyebrow>
      <H size={24} serif style={{ marginTop: 6, marginBottom: 20 }}>
        {count} {plural} о модели
      </H>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        {mentions.map((m) => (
          <Link
            key={m.id}
            href={`/news/${m.id}`}
            style={{
              display: 'block',
              padding: 16,
              border: '1px solid hsl(var(--rt-border-subtle))',
              borderRadius: 4,
              textDecoration: 'none',
              color: 'inherit',
              background: 'hsl(var(--rt-paper))',
            }}
          >
            <T
              size={10}
              mono
              color="hsl(var(--rt-ink-40))"
              style={{ textTransform: 'uppercase', letterSpacing: 1 }}
            >
              {[
                m.category_display || m.category,
                formatNewsDate(m.pub_date),
                m.reading_time_minutes ? `${m.reading_time_minutes} мин` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </T>
            <div style={{ marginTop: 6 }}>
              <T size={14} weight={500} style={{ lineHeight: 1.35 }}>
                {m.title}
              </T>
            </div>
          </Link>
        ))}
      </div>

      <style>{`
        @media (max-width: 1023px) {
          .rt-section-mentions { padding: 28px 16px !important; }
        }
      `}</style>
    </section>
  );
}
