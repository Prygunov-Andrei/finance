import Link from 'next/link';
import type {
  RatingModelDetail,
  RatingModelListItem,
} from '@/lib/api/types/rating';
import { BrandLogo, Eyebrow, H, T, formatPrice } from './primitives';
import { pickRelated } from './related';

type Props = {
  detail: RatingModelDetail;
  models: RatingModelListItem[];
};

export default function DetailRelated({ detail, models }: Props) {
  const related = pickRelated(models, detail.id, detail.rank);
  if (related.length === 0) return null;

  return (
    <section
      className="rt-detail-related"
      style={{
        padding: '36px 40px 48px',
        borderTop: '1px solid hsl(var(--rt-border-subtle))',
        background: 'hsl(var(--rt-alt))',
      }}
    >
      <Eyebrow>Сравнить с конкурентами</Eyebrow>
      <H size={24} serif style={{ marginTop: 6, marginBottom: 20, letterSpacing: -0.3 }}>
        Что ещё смотрят рядом с {detail.inner_unit}
      </H>
      <div
        className="rt-related-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
        }}
      >
        {related.map((m) => (
          <RelatedCard key={m.id} model={m} />
        ))}
      </div>

      <style>{`
        @media (max-width: 1099px) and (min-width: 600px) {
          .rt-related-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 599px) {
          .rt-detail-related { padding: 24px 18px 32px !important; }
          .rt-related-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function RelatedCard({ model }: { model: RatingModelListItem }) {
  return (
    <Link
      href={`/ratings/${model.slug}/`}
      style={{
        padding: '18px 18px',
        background: 'hsl(var(--rt-paper))',
        borderRadius: 6,
        border: '1px solid hsl(var(--rt-border-subtle))',
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 10,
        }}
      >
        <T size={11} color="hsl(var(--rt-ink-40))" mono>
          № {model.rank ?? '—'}
        </T>
        <span
          style={{
            fontFamily: 'var(--rt-font-serif)',
            fontSize: 18,
            fontWeight: 600,
            color: 'hsl(var(--rt-accent))',
            letterSpacing: -0.2,
          }}
        >
          {model.total_index.toFixed(1)}
        </span>
      </div>
      <div style={{ height: 24, display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <BrandLogo src={model.brand_logo} name={model.brand} size={28} />
      </div>
      <T size={12} color="hsl(var(--rt-ink-60))" style={{ display: 'block' }}>
        {model.inner_unit}
      </T>
      <div
        aria-hidden
        style={{
          marginTop: 12,
          width: '100%',
          height: 92,
          background:
            'repeating-linear-gradient(45deg, hsl(var(--rt-alt)) 0 8px, hsl(var(--rt-chip)) 8px 16px)',
          borderRadius: 4,
        }}
      />
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: 'hsl(var(--rt-ink))' }}>
          {model.price ? formatPrice(model.price) : '—'}
        </span>
        <T size={11} color="hsl(var(--rt-accent))" weight={500}>
          Открыть →
        </T>
      </div>
    </Link>
  );
}
