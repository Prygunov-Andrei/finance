import Link from 'next/link';

export default function NewsBreadcrumb({ category }: { category?: string }) {
  return (
    <nav
      aria-label="Хлебные крошки"
      style={{
        padding: '12px 0 18px',
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
        fontFamily: 'var(--rt-font-mono)',
        fontSize: 11,
        color: 'hsl(var(--rt-ink-60))',
        letterSpacing: 0.2,
      }}
    >
      <Link
        href="/"
        style={{
          color: 'hsl(var(--rt-accent))',
          textDecoration: 'none',
          marginRight: 10,
        }}
      >
        ← Все новости
      </Link>
      <span style={{ color: 'hsl(var(--rt-ink-40))' }}>·</span>
      <Link href="/" style={{ color: 'hsl(var(--rt-ink-60))', textDecoration: 'none', marginLeft: 10 }}>
        Главная
      </Link>
      <span style={{ color: 'hsl(var(--rt-ink-40))', margin: '0 8px' }}>/</span>
      <Link href="/" style={{ color: 'hsl(var(--rt-ink-60))', textDecoration: 'none' }}>
        Новости
      </Link>
      {category && (
        <>
          <span style={{ color: 'hsl(var(--rt-ink-40))', margin: '0 8px' }}>/</span>
          <span style={{ color: 'hsl(var(--rt-ink))' }}>{category}</span>
        </>
      )}
    </nav>
  );
}
