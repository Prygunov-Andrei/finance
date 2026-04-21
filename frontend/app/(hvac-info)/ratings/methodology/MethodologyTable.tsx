'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { RatingMethodologyCriterion } from '@/lib/api/types/rating';

type TypeKey = 'num' | 'bin' | 'cat' | 'fallback' | 'age';

const TYPE_META: Record<TypeKey, { label: string; dot: string; bg: string }> = {
  num: {
    label: 'Числовой',
    dot: 'hsl(var(--rt-accent))',
    bg: 'hsl(var(--rt-accent-bg))',
  },
  bin: {
    label: 'Бинарный',
    dot: 'hsl(var(--rt-ink-60))',
    bg: 'hsl(var(--rt-chip))',
  },
  cat: { label: 'Категориальный', dot: '#c87510', bg: 'rgba(200,117,16,0.10)' },
  fallback: { label: 'С fallback', dot: '#2f8046', bg: 'rgba(47,128,70,0.10)' },
  age: { label: 'Возраст бренда', dot: '#8a3ea8', bg: 'rgba(138,62,168,0.10)' },
};

const TYPE_ORDER: TypeKey[] = ['num', 'bin', 'cat', 'fallback', 'age'];

export function typeOf(c: Pick<RatingMethodologyCriterion, 'value_type' | 'scoring_type'>): TypeKey {
  const v = (c.value_type || '').toLowerCase();
  const s = (c.scoring_type || '').toLowerCase();
  if (v === 'binary' || s === 'binary') return 'bin';
  if (v === 'categorical') return 'cat';
  if (v === 'fallback') return 'fallback';
  if (v === 'brand_age' || v === 'age') return 'age';
  return 'num';
}

function buildScaleText(c: RatingMethodologyCriterion): string {
  const t = typeOf(c);
  if (t === 'bin') return 'Есть / Нет';
  if (t === 'num' && c.min_value !== null && c.max_value !== null) {
    const med =
      c.median_value !== null ? `, медиана ${c.median_value}` : '';
    return `${c.min_value} — ${c.max_value}${med}`;
  }
  if (t === 'fallback') return 'Расчёт по формуле';
  if (t === 'age' && c.min_value !== null && c.max_value !== null) {
    const med =
      c.median_value !== null ? `, медиана ${Math.round(c.median_value)}` : '';
    return `${Math.round(c.min_value)} — ${Math.round(c.max_value)}${med}`;
  }
  return 'Индивидуальная шкала';
}

type Props = {
  criteria: RatingMethodologyCriterion[];
};

export default function MethodologyTable({ criteria }: Props) {
  const sorted = [...criteria].sort((a, b) => b.weight - a.weight);
  const initialOpen = new Set<string>(sorted.slice(0, 3).map((c) => c.code));
  const [open, setOpen] = useState<Set<string>>(initialOpen);
  const toggle = (code: string) => {
    const next = new Set(open);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setOpen(next);
  };

  const counts: Record<TypeKey, number> = {
    num: 0,
    bin: 0,
    cat: 0,
    fallback: 0,
    age: 0,
  };
  for (const c of sorted) counts[typeOf(c)] += 1;

  const maxWeight = sorted.length > 0 ? Math.max(...sorted.map((c) => c.weight)) : 1;

  return (
    <section
      className="rt-methodology-body"
      style={{
        padding: '0 56px 40px',
        maxWidth: 1280,
        margin: '0 auto',
      }}
    >
      <div
        className="rt-methodology-legend"
        style={{
          marginTop: 28,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--rt-font-mono)',
            fontSize: 11,
            color: 'hsl(var(--rt-ink-40))',
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            marginRight: 4,
          }}
        >
          Типы шкал
        </span>
        {TYPE_ORDER.map((k) => {
          const m = TYPE_META[k];
          return (
            <span
              key={k}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                background: m.bg,
                borderRadius: 3,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: m.dot,
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 500 }}>{m.label}</span>
              <span
                style={{
                  fontSize: 11,
                  color: 'hsl(var(--rt-ink-40))',
                  fontFamily: 'var(--rt-font-mono)',
                }}
              >
                {counts[k]}
              </span>
            </span>
          );
        })}
      </div>

      {sorted.length === 0 ? (
        <div
          style={{
            marginTop: 32,
            padding: '40px 24px',
            textAlign: 'center',
            background: 'hsl(var(--rt-alt))',
            borderRadius: 4,
            color: 'hsl(var(--rt-ink-60))',
            fontSize: 14,
          }}
          data-testid="methodology-empty"
        >
          Критерии методики временно недоступны.
        </div>
      ) : (
        <div className="rt-methodology-table" style={{ marginTop: 32 }}>
          <div
            className="rt-methodology-row rt-methodology-header"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 150px 100px 200px 24px',
              padding: '0 0 10px',
              borderBottom: '1px solid hsl(var(--rt-ink-15))',
              gap: 12,
            }}
          >
            {['Критерий', 'Тип шкалы', 'Вес', 'Шкала', ''].map((h, idx) => (
              <span
                key={idx}
                style={{
                  fontFamily: 'var(--rt-font-mono)',
                  fontSize: 10,
                  color: 'hsl(var(--rt-ink-40))',
                  textTransform: 'uppercase',
                  letterSpacing: 1.2,
                  textAlign: idx === 2 ? 'right' : 'left',
                }}
              >
                {h}
              </span>
            ))}
          </div>
          {sorted.map((c, i) => {
            const t = typeOf(c);
            const m = TYPE_META[t];
            const isOpen = open.has(c.code);
            const scale = buildScaleText(c);
            return (
              <div key={c.code}>
                <button
                  type="button"
                  onClick={() => toggle(c.code)}
                  aria-expanded={isOpen}
                  aria-controls={`methodology-row-${c.code}`}
                  data-testid={`methodology-row-${c.code}`}
                  className="rt-methodology-row rt-methodology-row-btn"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 150px 100px 200px 24px',
                    padding: '14px 0',
                    borderBottom: '1px solid hsl(var(--rt-border-subtle))',
                    gap: 12,
                    alignItems: 'center',
                    cursor: 'pointer',
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    borderBottomStyle: 'solid',
                    borderBottomWidth: 1,
                    borderBottomColor: 'hsl(var(--rt-border-subtle))',
                    font: 'inherit',
                    color: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <span>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--rt-font-mono)',
                          fontSize: 10,
                          color: 'hsl(var(--rt-ink-40))',
                          width: 24,
                          flexShrink: 0,
                        }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>
                        {c.name_ru}
                      </span>
                      {c.unit ? (
                        <span
                          style={{
                            fontFamily: 'var(--rt-font-mono)',
                            fontSize: 10,
                            color: 'hsl(var(--rt-ink-40))',
                          }}
                        >
                          {c.unit}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 9px',
                      background: m.bg,
                      borderRadius: 3,
                      width: 'fit-content',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        background: m.dot,
                      }}
                    />
                    <span style={{ fontSize: 11 }}>{m.label}</span>
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--rt-font-mono)',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'hsl(var(--rt-accent))',
                      }}
                    >
                      {c.weight}%
                    </span>
                    <span
                      style={{
                        width: 60,
                        height: 4,
                        background: 'hsl(var(--rt-ink-08))',
                        borderRadius: 2,
                        overflow: 'hidden',
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          width: `${(c.weight / maxWeight) * 100}%`,
                          height: '100%',
                          background: 'hsl(var(--rt-accent))',
                        }}
                      />
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'hsl(var(--rt-ink-60))',
                    }}
                  >
                    {scale}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      fontSize: 14,
                      color: 'hsl(var(--rt-ink-40))',
                      textAlign: 'center',
                      transform: isOpen ? 'rotate(45deg)' : 'none',
                      transition: 'transform 0.15s',
                      display: 'inline-block',
                    }}
                  >
                    +
                  </span>
                </button>
                {isOpen && (
                  <div
                    id={`methodology-row-${c.code}`}
                    className="rt-methodology-panel"
                    style={{
                      padding: '14px 0 22px 34px',
                      borderBottom: '1px solid hsl(var(--rt-border-subtle))',
                      display: 'grid',
                      gridTemplateColumns: '1fr 240px',
                      gap: 32,
                    }}
                  >
                    <p
                      style={{
                        fontFamily: 'var(--rt-font-serif)',
                        fontSize: 13,
                        lineHeight: 1.65,
                        color: 'hsl(var(--rt-ink-80))',
                        margin: 0,
                        maxWidth: 560,
                      }}
                    >
                      {c.description_ru || '—'}
                    </p>
                    <div
                      style={{
                        background: 'hsl(var(--rt-alt))',
                        padding: 14,
                        borderRadius: 4,
                      }}
                    >
                      <p
                        style={{
                          fontFamily: 'var(--rt-font-mono)',
                          fontSize: 10,
                          color: 'hsl(var(--rt-ink-40))',
                          textTransform: 'uppercase',
                          letterSpacing: 1.2,
                          margin: 0,
                        }}
                      >
                        Как оценивается
                      </p>
                      <p style={{ fontSize: 12, margin: '6px 0 0' }}>{scale}</p>
                      {c.unit ? (
                        <p
                          style={{
                            fontFamily: 'var(--rt-font-mono)',
                            fontSize: 11,
                            color: 'hsl(var(--rt-ink-60))',
                            margin: '8px 0 0',
                          }}
                        >
                          Ед. изм.: {c.unit}
                        </p>
                      ) : null}
                      <p
                        style={{
                          fontFamily: 'var(--rt-font-mono)',
                          fontSize: 11,
                          color: 'hsl(var(--rt-ink-60))',
                          margin: '8px 0 0',
                        }}
                      >
                        Группа: {c.group_display || '—'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div
        className="rt-methodology-footer"
        style={{
          marginTop: 40,
          padding: 24,
          background: 'hsl(var(--rt-alt))',
          borderTop: '1px solid hsl(var(--rt-border-subtle))',
          display: 'flex',
          gap: 24,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 12, color: 'hsl(var(--rt-ink-60))' }}>
          Методика утверждена 2022 · актуальная версия v1.0
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          disabled
          style={{
            padding: '9px 14px',
            fontSize: 12,
            border: '1px solid hsl(var(--rt-border))',
            background: 'transparent',
            color: 'hsl(var(--rt-ink-40))',
            borderRadius: 3,
            cursor: 'not-allowed',
            fontFamily: 'var(--rt-font-sans)',
          }}
          title="PDF в разработке"
        >
          Скачать PDF
        </button>
        <Link
          href="/ratings/submit/"
          style={{
            padding: '10px 16px',
            fontSize: 13,
            background: 'hsl(var(--rt-ink))',
            color: 'hsl(var(--rt-paper))',
            borderRadius: 3,
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          Предложить модель →
        </Link>
      </div>

      <style>{`
        @media (max-width: 899px) {
          .rt-methodology-body {
            padding: 0 20px 40px !important;
          }
          .rt-methodology-header {
            display: none !important;
          }
          .rt-methodology-row-btn {
            display: flex !important;
            flex-wrap: wrap !important;
            align-items: center !important;
            row-gap: 8px !important;
            column-gap: 10px !important;
          }
          .rt-methodology-row-btn > :nth-child(1) { flex: 1 1 100%; }
          .rt-methodology-row-btn > :nth-child(2) { flex: 0 0 auto; }
          .rt-methodology-row-btn > :nth-child(3) { flex: 1 1 auto; justify-content: flex-end !important; }
          .rt-methodology-row-btn > :nth-child(4) { flex: 1 1 100%; }
          .rt-methodology-row-btn > :nth-child(5) { flex: 0 0 24px; }
          .rt-methodology-panel {
            grid-template-columns: 1fr !important;
            padding-left: 0 !important;
          }
        }
      `}</style>
    </section>
  );
}
