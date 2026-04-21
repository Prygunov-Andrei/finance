import Link from 'next/link';

type NavItem =
  | { label: string; href: string; active?: boolean }
  | { label: string; muted: true };

const NAV_ITEMS: NavItem[] = [
  { label: 'Новости', href: '/news' },
  { label: 'Рейтинг', href: '/ratings', active: true },
  { label: 'ISmeta', href: '/smeta' },
  { label: 'Мешок Монтажников', muted: true },
  { label: 'Анализ проектов', muted: true },
  { label: 'Франшиза', muted: true },
  { label: 'Ассоциация', muted: true },
  { label: 'Стандарт монтажа', muted: true },
];

export default function RatingHeader() {
  return (
    <header
      style={{
        borderBottom: '1px solid hsl(var(--rt-border-subtle))',
        background: 'hsl(var(--rt-paper))',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 64,
          padding: '0 28px',
          gap: 28,
          maxWidth: 1440,
          margin: '0 auto',
        }}
      >
        <Link
          href="/"
          aria-label="HVAC Info — главная"
          style={{
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            height: 36,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/rating-logo/hvac-info-light.svg"
            alt="HVAC Info"
            className="rt-logo-light"
            width={144}
            height={36}
            style={{ display: 'block', height: 36, width: 'auto' }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/rating-logo/hvac-info-dark.svg"
            alt="HVAC Info"
            className="rt-logo-dark"
            width={144}
            height={36}
            style={{ display: 'none', height: 36, width: 'auto' }}
          />
        </Link>

        <nav
          style={{
            display: 'none',
            gap: 22,
            flex: 1,
            alignItems: 'center',
          }}
          className="rt-nav-desktop"
        >
          {NAV_ITEMS.map((item) => {
            if ('muted' in item) {
              return (
                <span
                  key={item.label}
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'hsl(var(--rt-ink-25))',
                    cursor: 'default',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    letterSpacing: -0.1,
                  }}
                >
                  {item.label}
                </span>
              );
            }
            const isActive = item.active === true;
            return (
              <Link
                key={item.label}
                href={item.href}
                style={{
                  position: 'relative',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive
                    ? 'hsl(var(--rt-ink))'
                    : 'hsl(var(--rt-ink-80))',
                  textDecoration: 'none',
                  paddingBottom: 8,
                  marginBottom: -8,
                  letterSpacing: -0.1,
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 2,
                      background: 'hsl(var(--rt-accent))',
                      borderRadius: 1,
                    }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div
          style={{
            display: 'none',
            gap: 14,
            alignItems: 'center',
          }}
          className="rt-actions-desktop"
        >
          <SearchIcon />
          <span style={{ width: 1, height: 14, background: 'hsl(var(--rt-border))' }} />
          <span style={{ fontSize: 11, color: 'hsl(var(--rt-ink-60))' }}>RU</span>
          <MoonIcon />
          <span
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              border: '1px solid hsl(var(--rt-border))',
              fontSize: 11,
              fontWeight: 500,
              color: 'hsl(var(--rt-ink-80))',
            }}
          >
            Вход
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            marginLeft: 'auto',
          }}
          className="rt-actions-mobile"
        >
          <MenuIcon />
          <SearchIcon />
        </div>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .rt-nav-desktop { display: flex !important; }
          .rt-actions-desktop { display: flex !important; }
          .rt-actions-mobile { display: none !important; }
        }
        .dark .rt-logo-light { display: none !important; }
        .dark .rt-logo-dark { display: block !important; }
      `}</style>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--rt-ink-60))" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 21l-4.3-4.3" />
      <circle cx={11} cy={11} r={8} />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--rt-ink-60))" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="hsl(var(--rt-ink))" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18 M3 12h18 M3 18h18" />
    </svg>
  );
}
