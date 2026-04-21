import Link from 'next/link';

type Props = {
  ratingTitle?: string;
};

export default function DetailBreadcrumb({
  ratingTitle = 'Кондиционеры 2026',
}: Props) {
  return (
    <div
      className="rt-breadcrumb"
      style={{
        padding: '14px 40px',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        color: 'hsl(var(--rt-ink-60))',
      }}
    >
      <Link
        href="/ratings"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          color: 'hsl(var(--rt-ink-60))',
          textDecoration: 'none',
        }}
      >
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M15 18 L9 12 L15 6" />
        </svg>
        <span>
          Вернуться в рейтинг ·{' '}
          <span style={{ color: 'hsl(var(--rt-ink))', fontWeight: 500 }}>
            {ratingTitle}
          </span>
        </span>
      </Link>

      <style>{`
        @media (max-width: 899px) {
          .rt-breadcrumb { padding: 12px 18px !important; }
        }
      `}</style>
    </div>
  );
}
