import Image from 'next/image';
import type { RatingModelDetail } from '@/lib/api/types/rating';
import { Eyebrow, T } from './primitives';
import { parsePoints, type ProsConsPoint } from './detailHelpers';

type Props = {
  detail: RatingModelDetail;
};

const EDITORS: Array<{ name: string; avatar: string }> = [
  { name: 'М. Савинов', avatar: '/rating-authors/savinov.jpg' },
  { name: 'А. Прыгунов', avatar: '/rating-authors/prygunov.jpg' },
];

const DATE_LABEL = 'редакция · апрель 2026';

export default function DetailEditorial({ detail }: Props) {
  const verdict = (detail.editorial_body || detail.editorial_quote || '').trim();
  const pros = parsePoints(detail.pros_text);
  const cons = parsePoints(detail.cons_text);
  const hasContent = verdict.length > 0 || pros.length > 0 || cons.length > 0;

  if (!hasContent) return null;

  return (
    <div
      className="rt-detail-editorial"
      style={{
        padding: '22px 22px',
        border: '1px solid hsl(var(--rt-border-subtle))',
        borderRadius: 6,
        background: 'hsl(var(--rt-paper))',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        position: 'sticky',
        top: 120,
      }}
    >
      {verdict && (
        <div>
          <Eyebrow>Вердикт редакции</Eyebrow>
          <p
            style={{
              margin: '10px 0 0',
              fontFamily: 'var(--rt-font-serif)',
              fontSize: 15,
              lineHeight: 1.55,
              color: 'hsl(var(--rt-ink))',
              letterSpacing: -0.1,
            }}
          >
            {trimVerdict(verdict)}
          </p>
          <div
            aria-hidden
            style={{
              marginTop: 18,
              height: 1,
              background: 'hsl(var(--rt-border-subtle))',
            }}
          />
          <EditorsRow />
        </div>
      )}

      {(pros.length > 0 || cons.length > 0) && (
        <div className="rt-proscons-grid">
          {pros.length > 0 && <PointsCard kind="pros" items={pros} />}
          {cons.length > 0 && <PointsCard kind="cons" items={cons} />}
        </div>
      )}

      <style>{`
        .rt-proscons-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        @media (max-width: 1023px) {
          .rt-detail-editorial { position: static !important; top: auto !important; }
        }
        /* Dark mode: pale green/red bg + light текст не читается. Затемняем текст
           до тёмно-зелёного / тёмно-красного оттенка, оставляя бледный фон. */
        .dark .rt-proscons-card[data-pros="true"] {
          background: hsl(140 30% 88%) !important;
        }
        .dark .rt-proscons-card[data-cons="true"] {
          background: hsl(8 35% 88%) !important;
        }
        .dark .rt-proscons-card[data-pros="true"] .rt-proscons-text,
        .dark .rt-proscons-card[data-pros="true"] .rt-proscons-text * {
          color: hsl(140 60% 18%) !important;
        }
        .dark .rt-proscons-card[data-cons="true"] .rt-proscons-text,
        .dark .rt-proscons-card[data-cons="true"] .rt-proscons-text * {
          color: hsl(8 60% 22%) !important;
        }
      `}</style>
    </div>
  );
}

// Verdict limit: 4 предложения / 420 символов, чтобы aside не вытягивал криты-таблицу.
function trimVerdict(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 420) return trimmed;
  const cut = trimmed.slice(0, 420);
  const lastDot = cut.lastIndexOf('.');
  if (lastDot > 250) return `${cut.slice(0, lastDot + 1)}`;
  return `${cut}…`;
}

function EditorsRow() {
  return (
    <div
      style={{
        marginTop: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex' }}>
        {EDITORS.map((e, i) => (
          <Image
            key={e.name}
            src={e.avatar}
            alt={e.name}
            width={32}
            height={32}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid hsl(var(--rt-paper))',
              marginLeft: i === 0 ? 0 : -8,
              boxShadow: '0 0 0 1px hsl(var(--rt-border-subtle))',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <T size={12} weight={600} style={{ lineHeight: 1.3 }}>
          {EDITORS.map((e) => e.name).join(' · ')}
        </T>
        <T
          size={10}
          color="hsl(var(--rt-ink-40))"
          mono
          style={{ textTransform: 'uppercase', letterSpacing: 1 }}
        >
          {DATE_LABEL}
        </T>
      </div>
    </div>
  );
}

function PointsCard({
  kind,
  items,
}: {
  kind: 'pros' | 'cons';
  items: ProsConsPoint[];
}) {
  const isPros = kind === 'pros';
  const accent = isPros ? '#1f8f4c' : '#b24a3b';
  const softBg = isPros ? 'hsl(140 50% 96%)' : 'hsl(8 60% 96%)';
  const label = isPros ? `Плюсы · ${items.length}` : `Минусы · ${items.length}`;

  return (
    <div
      data-testid={isPros ? 'pros-card' : 'cons-card'}
      data-pros={isPros ? 'true' : undefined}
      data-cons={!isPros ? 'true' : undefined}
      className="rt-proscons-card"
      style={{
        background: softBg,
        borderLeft: `4px solid ${accent}`,
        borderRadius: 4,
        padding: '14px 16px 14px 18px',
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <span
          style={{
            fontFamily: 'var(--rt-font-mono)',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            fontWeight: 700,
            color: accent,
          }}
        >
          {label}
        </span>
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {items.map((p, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              gap: 9,
              alignItems: 'flex-start',
            }}
          >
            <span style={{ marginTop: 2, flexShrink: 0 }}>
              <PointGlyph kind={kind} accent={accent} small />
            </span>
            <div className="rt-proscons-text" style={{ flex: 1, minWidth: 0 }}>
              <T size={12} weight={600} style={{ lineHeight: 1.35 }}>
                {p.title}
              </T>
              {p.body && (
                <T
                  size={11}
                  color="hsl(var(--rt-ink-60))"
                  style={{ marginTop: 3, lineHeight: 1.4, display: 'block' }}
                >
                  {p.body}
                </T>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PointGlyph({
  kind,
  accent,
  small = false,
}: {
  kind: 'pros' | 'cons';
  accent: string;
  small?: boolean;
}) {
  const size = small ? 14 : 16;
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: accent,
        color: '#fff',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: small ? 1 : 0,
      }}
    >
      <svg
        width={small ? 8 : 10}
        height={small ? 8 : 10}
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {kind === 'pros' ? (
          <path d="M2.5 6.2 L5 8.5 L9.5 3.8" />
        ) : (
          <path d="M3 6 L9 6" />
        )}
      </svg>
    </span>
  );
}
