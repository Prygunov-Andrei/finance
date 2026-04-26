import Link from 'next/link';
import type { HvacNews as NewsItem } from '@/lib/api/types/hvac';
import { T } from '../../../rating-split-system/_components/primitives';

interface Props {
  prev: NewsItem | null;
  next: NewsItem | null;
}

export default function NewsPrevNextNav({ prev, next }: Props) {
  if (!prev && !next) return null;
  return (
    <nav
      aria-label="Соседние новости"
      style={{
        marginTop: 28,
        paddingTop: 22,
        borderTop: '1px solid hsl(var(--rt-border-subtle))',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 14,
      }}
      className="rt-prev-next-nav"
    >
      <SideCard
        item={prev}
        align="left"
        eyebrow="← Предыдущая"
        emptyLabel="Это первая новость"
      />
      <SideCard
        item={next}
        align="right"
        eyebrow="Следующая →"
        emptyLabel="Это последняя новость"
      />

      <style>{`
        @media (max-width: 639px) {
          .rt-prev-next-nav { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </nav>
  );
}

function SideCard({
  item,
  align,
  eyebrow,
  emptyLabel,
}: {
  item: NewsItem | null;
  align: 'left' | 'right';
  eyebrow: string;
  emptyLabel: string;
}) {
  if (!item) {
    return (
      <div
        style={{
          padding: 14,
          border: '1px dashed hsl(var(--rt-border-subtle))',
          borderRadius: 4,
          textAlign: align,
          color: 'hsl(var(--rt-ink-40))',
        }}
      >
        <T size={10} mono color="hsl(var(--rt-ink-40))" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
          {eyebrow}
        </T>
        <div style={{ marginTop: 6, fontSize: 12 }}>{emptyLabel}</div>
      </div>
    );
  }
  return (
    <Link
      href={`/news/${item.id}`}
      style={{
        display: 'block',
        padding: 14,
        border: '1px solid hsl(var(--rt-border-subtle))',
        borderRadius: 4,
        textDecoration: 'none',
        color: 'inherit',
        textAlign: align,
      }}
    >
      <T size={10} mono color="hsl(var(--rt-ink-40))" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
        {eyebrow}
      </T>
      <div style={{ marginTop: 6 }}>
        <T size={13} weight={500} style={{ lineHeight: 1.35 }}>
          {item.title}
        </T>
      </div>
    </Link>
  );
}
