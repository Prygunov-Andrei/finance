import Link from 'next/link';
import type { HvacNewsMentionedAcModel } from '@/lib/api/types/hvac';
import { BrandLogo, Eyebrow, T, formatPrice } from '../../../rating-split-system/_components/primitives';

export default function NewsMentionedModelCard({
  models,
}: {
  models: HvacNewsMentionedAcModel[];
}) {
  if (!models || models.length === 0) return null;

  if (models.length === 1) {
    const m = models[0];
    return (
      <section style={{ marginTop: 28 }}>
        <SingleCard model={m} />
      </section>
    );
  }

  return (
    <section style={{ marginTop: 28 }}>
      <Eyebrow>Упомянутые модели</Eyebrow>
      <div
        style={{
          marginTop: 10,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        {models.slice(0, 3).map((m) => (
          <CompactCard key={m.id} model={m} />
        ))}
      </div>
    </section>
  );
}

function SingleCard({ model }: { model: HvacNewsMentionedAcModel }) {
  const index =
    typeof model.total_index === 'number' ? model.total_index.toFixed(1) : null;
  return (
    <div
      style={{
        padding: 18,
        border: '1px solid hsl(var(--rt-border-subtle))',
        borderRadius: 6,
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        background: 'hsl(var(--rt-paper))',
      }}
      className="rt-mentioned-single"
    >
      <div style={{ flexShrink: 0 }}>
        <BrandLogo
          src={model.brand_logo || ''}
          srcDark={model.brand_logo_dark}
          name={model.brand || ''}
          size={32}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Eyebrow>Упомянутая модель</Eyebrow>
        <div style={{ marginTop: 4 }}>
          <T size={14} weight={600}>
            {model.brand} {model.inner_unit}
          </T>
        </div>
        <div style={{ marginTop: 2 }}>
          <T size={11} color="hsl(var(--rt-ink-60))">
            {[index ? `Индекс ${index}` : null, formatPrice(model.price ?? null)]
              .filter((x): x is string => Boolean(x) && x !== '—')
              .join(' · ') || 'Детали в рейтинге'}
          </T>
        </div>
      </div>
      <Link
        href={`/rating-split-system/${model.slug}/`}
        style={{
          padding: '8px 14px',
          borderRadius: 4,
          border: '1px solid hsl(var(--rt-accent))',
          background: 'hsl(var(--rt-accent-bg))',
          color: 'hsl(var(--rt-accent))',
          fontSize: 12,
          fontWeight: 600,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Открыть →
      </Link>

      <style>{`
        @media (max-width: 639px) {
          .rt-mentioned-single { flex-direction: column; align-items: stretch !important; }
        }
      `}</style>
    </div>
  );
}

function CompactCard({ model }: { model: HvacNewsMentionedAcModel }) {
  return (
    <Link
      href={`/rating-split-system/${model.slug}/`}
      style={{
        display: 'block',
        padding: 14,
        border: '1px solid hsl(var(--rt-border-subtle))',
        borderRadius: 4,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <BrandLogo
          src={model.brand_logo || ''}
          srcDark={model.brand_logo_dark}
          name={model.brand || ''}
          size={28}
        />
        <T size={13} weight={600} style={{ lineHeight: 1.3 }}>
          {model.brand} {model.inner_unit}
        </T>
      </div>
      <div style={{ marginTop: 6 }}>
        <T size={10} mono color="hsl(var(--rt-ink-40))">
          {typeof model.total_index === 'number'
            ? `Индекс ${model.total_index.toFixed(1)}`
            : 'Рейтинг →'}
        </T>
      </div>
    </Link>
  );
}
