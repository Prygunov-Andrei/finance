import Link from 'next/link';

export default function BackToRating() {
  return (
    <div
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
          gap: 6,
          color: 'hsl(var(--rt-accent))',
          textDecoration: 'none',
          fontFamily: 'var(--rt-font-mono)',
          letterSpacing: 0.5,
        }}
      >
        <span aria-hidden>←</span>
        Вернуться в рейтинг
      </Link>
    </div>
  );
}
