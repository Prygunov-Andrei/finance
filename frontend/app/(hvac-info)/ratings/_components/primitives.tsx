import type { CSSProperties, ReactNode } from 'react';

export function Meter({
  value,
  width = 72,
  height = 5,
}: {
  value: number;
  width?: number | string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      aria-hidden
      style={{
        width,
        height,
        background: 'hsl(var(--rt-ink-15))',
        borderRadius: 2,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: 'hsl(var(--rt-accent))',
        }}
      />
    </div>
  );
}

export function BrandLogo({
  src,
  srcDark,
  name,
  size = 28,
  tooltip,
}: {
  src: string;
  /** Dark-theme версия логотипа. Если не передана или пустая — используется
   *  CSS-фоллбек `filter: invert(1) hue-rotate(180deg)` на `src` в `.dark`. */
  srcDark?: string | null;
  name: string;
  size?: 28 | 32 | 44 | 64;
  /** Native HTML tooltip (title=) — показывается на hover над логотипом. */
  tooltip?: string;
}) {
  if (src) {
    const imgStyle: CSSProperties = {
      maxHeight: size,
      maxWidth: size * 4,
      objectFit: 'contain',
    };
    const hasDark = Boolean(srcDark);
    if (!hasDark) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          title={tooltip}
          className="rt-brand-logo-single"
          style={{ ...imgStyle, display: 'block' }}
        />
      );
    }
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          title={tooltip}
          className="rt-brand-logo-light"
          style={{ ...imgStyle, display: 'block' }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={srcDark as string}
          alt={name}
          title={tooltip}
          aria-hidden="true"
          className="rt-brand-logo-dark"
          style={{ ...imgStyle, display: 'none' }}
        />
      </>
    );
  }
  const letter = name ? name.trim().charAt(0).toUpperCase() : '·';
  return (
    <div
      aria-label={name}
      title={tooltip}
      style={{
        width: size,
        height: size,
        background: 'hsl(var(--rt-chip))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--rt-font-mono)',
        fontSize: size === 32 ? 13 : 11,
        fontWeight: 500,
        color: 'hsl(var(--rt-ink-60))',
        borderRadius: 2,
      }}
    >
      {letter}
    </div>
  );
}

export function Eyebrow({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontFamily: 'var(--rt-font-mono)',
        fontSize: 10,
        color: 'hsl(var(--rt-ink-40))',
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Pill({
  active = false,
  children,
  onClick,
  as = 'span',
  href,
  style,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  as?: 'span' | 'button';
  href?: string;
  style?: CSSProperties;
}) {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '6px 12px',
    borderRadius: 14,
    fontSize: 11,
    fontFamily: 'var(--rt-font-sans)',
    fontWeight: active ? 600 : 500,
    border: active
      ? '1px solid hsl(var(--rt-accent))'
      : '1px solid hsl(var(--rt-border))',
    background: active ? 'hsl(var(--rt-accent-bg))' : 'transparent',
    color: active ? 'hsl(var(--rt-accent))' : 'hsl(var(--rt-ink-60))',
    cursor: onClick || href ? 'pointer' : 'default',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    ...style,
  };
  if (as === 'button') {
    return (
      <button type="button" onClick={onClick} style={base}>
        {children}
      </button>
    );
  }
  return <span style={base}>{children}</span>;
}

type HSize = 16 | 17 | 18 | 22 | 24 | 26 | 30 | 34;

export function H({
  size = 22,
  serif = false,
  children,
  style,
  className,
  as: Tag = 'h2',
}: {
  size?: HSize;
  serif?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4';
}) {
  return (
    <Tag
      className={className}
      style={{
        margin: 0,
        fontSize: size,
        fontFamily: serif
          ? 'var(--rt-font-serif)'
          : 'var(--rt-font-sans)',
        fontWeight: 600,
        letterSpacing: -0.3,
        lineHeight: 1.25,
        color: 'hsl(var(--rt-ink))',
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

export function T({
  size = 13,
  weight = 400,
  color,
  mono = false,
  children,
  style,
  className,
}: {
  size?: number;
  weight?: 400 | 500 | 600 | 700;
  color?: string;
  mono?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        fontSize: size,
        fontWeight: weight,
        color: color ?? 'hsl(var(--rt-ink))',
        fontFamily: mono ? 'var(--rt-font-mono)' : 'var(--rt-font-sans)',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function formatPrice(price: string | number | null | undefined): string {
  if (price == null || price === '') return '—';
  const n = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(n)) return '—';
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(n))} ₽`;
}
