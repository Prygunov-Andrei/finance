import type { RatingModelDetail } from '@/lib/api/types/rating';
import { Eyebrow, T } from './primitives';
import { parsePoints, type ProsConsPoint } from './detailHelpers';

type Props = {
  detail: RatingModelDetail;
};

const EDITORS: Array<{ name: string; avatar: string }> = [
  { name: 'Савинов Максим', avatar: '/rating-authors/savinov.jpg' },
  { name: 'Прыгунов Андрей', avatar: '/rating-authors/prygunov.jpg' },
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

      {pros.length > 0 && <PointsColumn kind="pros" items={pros} />}
      {cons.length > 0 && <PointsColumn kind="cons" items={cons} />}

      <style>{`
        @media (max-width: 1023px) {
          .rt-detail-editorial { position: static !important; top: auto !important; }
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
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={e.name}
            src={e.avatar}
            alt={e.name}
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

function PointsColumn({
  kind,
  items,
}: {
  kind: 'pros' | 'cons';
  items: ProsConsPoint[];
}) {
  const color = kind === 'pros' ? '#1f8f4c' : '#b24a3b';
  const label = kind === 'pros' ? `Плюсы · ${items.length}` : `Минусы · ${items.length}`;
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
          }}
        />
        <span
          style={{
            fontFamily: 'var(--rt-font-mono)',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            fontWeight: 700,
            color,
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((p, i) => (
          <div key={i}>
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
        ))}
      </div>
    </div>
  );
}
