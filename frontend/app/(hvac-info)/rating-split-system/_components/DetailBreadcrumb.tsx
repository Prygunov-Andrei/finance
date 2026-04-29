import Link from 'next/link';
import type { RatingModelDetail } from '@/lib/api/types/rating';

export default function DetailBreadcrumb({ detail }: { detail: RatingModelDetail }) {
  const modelLabel = `${detail.brand.name} ${detail.inner_unit}`.trim();
  return (
    <nav
      aria-label="Хлебные крошки"
      style={{
        padding: '8px 0 12px',
        fontFamily: 'var(--rt-font-mono)',
        fontSize: 11,
        color: 'hsl(var(--rt-ink-60))',
        letterSpacing: 0.2,
      }}
    >
      <Link
        href="/"
        style={{ color: 'hsl(var(--rt-ink-60))', textDecoration: 'none' }}
      >
        Главная
      </Link>
      <span style={{ color: 'hsl(var(--rt-ink-40))', margin: '0 8px' }}>/</span>
      <Link
        href="/rating-split-system"
        style={{ color: 'hsl(var(--rt-ink-60))', textDecoration: 'none' }}
      >
        Рейтинг кондиционеров
      </Link>
      <span style={{ color: 'hsl(var(--rt-ink-40))', margin: '0 8px' }}>/</span>
      <span style={{ color: 'hsl(var(--rt-ink))' }}>{modelLabel}</span>
    </nav>
  );
}
