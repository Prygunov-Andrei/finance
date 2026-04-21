import { Eyebrow, H, T } from './primitives';
import { rankLabel } from './detailHelpers';

type Props = {
  totalIndex: number;
  median: number;
  allScores: number[];
  rank: number | null;
  totalModels: number;
  year?: number;
};

export default function DetailIndexViz({
  totalIndex,
  median,
  allScores,
  rank,
  totalModels,
  year = new Date().getFullYear(),
}: Props) {
  const label = rankLabel(rank);
  const headingPrefix = rank === 1 ? 'лидер среди' : `${label} среди`;
  const heading = `${totalIndex.toFixed(1)} — ${headingPrefix} ${totalModels} моделей ${year} года`;

  const xForScore = (v: number) => 40 + (Math.max(0, Math.min(100, v)) / 100) * 1120;

  return (
    <section
      className="rt-detail-indexviz"
      style={{
        padding: '32px 40px 40px',
        borderTop: '1px solid hsl(var(--rt-border-subtle))',
        background: 'hsl(var(--rt-alt))',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 18,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <Eyebrow>Где эта модель на шкале индекса</Eyebrow>
          <H size={24} serif style={{ marginTop: 6, letterSpacing: -0.3 }}>
            {heading}
          </H>
        </div>
        <T size={11} color="hsl(var(--rt-ink-60))">
          шкала 0–100 · медиана {median.toFixed(1)}
        </T>
      </header>

      <div style={{ position: 'relative', height: 64, marginTop: 8 }}>
        <svg
          width="100%"
          height={64}
          viewBox="0 0 1200 64"
          preserveAspectRatio="none"
          style={{ color: 'hsl(var(--rt-ink))', display: 'block' }}
        >
          {allScores.map((v, i) => {
            const x = xForScore(v);
            return (
              <circle
                key={i}
                cx={x}
                cy={46}
                r={2.5}
                fill="currentColor"
                opacity={v > 76 ? 0.2 : 0.12}
              />
            );
          })}
          <line
            x1={40}
            y1={58}
            x2={1160}
            y2={58}
            stroke="currentColor"
            strokeOpacity={0.15}
          />
          {[0, 25, 50, 75, 100].map((t) => {
            const x = xForScore(t);
            return (
              <g key={t}>
                <line
                  x1={x}
                  y1={54}
                  x2={x}
                  y2={62}
                  stroke="currentColor"
                  strokeOpacity={0.25}
                />
                <text
                  x={x}
                  y={18}
                  fontSize="10"
                  fill="currentColor"
                  opacity={0.5}
                  textAnchor="middle"
                  fontFamily="ui-monospace, monospace"
                >
                  {t}
                </text>
              </g>
            );
          })}
          {/* median */}
          <line
            x1={xForScore(median)}
            y1={30}
            x2={xForScore(median)}
            y2={58}
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeDasharray="3 3"
          />
          {/* this model */}
          <circle
            cx={xForScore(totalIndex)}
            cy={46}
            r={8}
            fill="hsl(var(--rt-accent))"
          />
          <text
            x={xForScore(totalIndex)}
            y={30}
            fontSize="12"
            fill="hsl(var(--rt-accent))"
            fontWeight={600}
            textAnchor="middle"
            fontFamily="ui-serif, Georgia, serif"
          >
            {totalIndex.toFixed(1)}
          </text>
        </svg>
      </div>

      <style>{`
        @media (max-width: 899px) {
          .rt-detail-indexviz { padding: 24px 18px 28px !important; }
        }
      `}</style>
    </section>
  );
}
