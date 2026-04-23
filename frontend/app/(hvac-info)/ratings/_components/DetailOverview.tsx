import type { RatingModelDetail } from '@/lib/api/types/rating';
import { Eyebrow, H, T } from './primitives';

type Props = {
  detail: RatingModelDetail;
};

export default function DetailOverview({ detail }: Props) {
  const body = (detail.editorial_body || '').trim();
  const paragraphs = body
    ? body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    : [];
  const quote = (detail.editorial_quote || '').trim();
  const quoteAuthor = (detail.editorial_quote_author || '').trim();

  return (
    <section
      data-anchor="overview"
      className="rt-detail-overview"
      style={{
        padding: '40px 40px 36px',
        borderTop: '1px solid hsl(var(--rt-border-subtle))',
      }}
    >
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        <Eyebrow>Обзор редакции</Eyebrow>
        <H
          size={30}
          serif
          style={{
            marginTop: 6,
            marginBottom: 22,
            letterSpacing: -0.3,
            lineHeight: 1.15,
            textWrap: 'balance',
          }}
        >
          Мнение редакции о модели {detail.brand.name} {detail.inner_unit}
        </H>

        {paragraphs.length === 0 ? (
          <div
            style={{
              padding: '20px 22px',
              background: 'hsl(var(--rt-alt))',
              border: '1px dashed hsl(var(--rt-border))',
              borderRadius: 6,
            }}
          >
            <T size={13} color="hsl(var(--rt-ink-60))" style={{ lineHeight: 1.6 }}>
              Редакторский обзор готовится. Следите за обновлениями рейтинга.
            </T>
          </div>
        ) : (
          paragraphs.map((p, i) => (
            <p
              key={i}
              style={{
                margin: '0 0 16px',
                fontSize: 14,
                color: 'hsl(var(--rt-ink))',
                lineHeight: 1.7,
              }}
            >
              {p}
            </p>
          ))
        )}

        {quote && (
          <div
            style={{
              margin: '28px 0',
              padding: '24px 28px',
              borderLeft: '3px solid hsl(var(--rt-accent))',
              background: 'hsl(var(--rt-alt))',
            }}
          >
            <T
              size={18}
              style={{
                fontFamily: 'var(--rt-font-serif)',
                fontStyle: 'italic',
                lineHeight: 1.5,
                letterSpacing: -0.1,
                display: 'block',
              }}
            >
              «{quote}»
            </T>
            {quoteAuthor && (
              <T
                size={11}
                color="hsl(var(--rt-ink-60))"
                mono
                style={{
                  marginTop: 12,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  display: 'block',
                }}
              >
                — {quoteAuthor}
              </T>
            )}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 899px) {
          .rt-detail-overview { padding: 28px 18px 28px !important; }
        }
      `}</style>
    </section>
  );
}
