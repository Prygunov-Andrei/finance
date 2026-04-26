'use client';

import { useState } from 'react';

/**
 * Inline «?» значок с всплывающей подсказкой-описанием критерия.
 * Используется в DetailCriteria (рядом с именем критерия в оценках)
 * и в SubmitForm (рядом с label поля параметра) — один и тот же UX.
 *
 * Если description пустой — рендерит disabled-значок без tooltip
 * (визуально приглушённый `?`), чтобы сетка меток оставалась ровной.
 */
export default function CriterionTooltip({
  description,
}: {
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const hasDesc = description.trim().length > 0;

  if (!hasDesc) {
    // Нет описания — рендерим disabled-значок без tooltip.
    return (
      <span
        aria-hidden
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '1px solid hsl(var(--rt-ink-25))',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          color: 'hsl(var(--rt-ink-25))',
          fontWeight: 600,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ?
      </span>
    );
  }

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="Описание критерия"
        aria-expanded={open}
        title={description}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '1px solid hsl(var(--rt-ink-40))',
          background: 'transparent',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          color: 'hsl(var(--rt-ink-40))',
          fontWeight: 600,
          cursor: 'help',
          lineHeight: 1,
          flexShrink: 0,
          fontFamily: 'var(--rt-font-sans)',
        }}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            top: 'calc(100% + 6px)',
            zIndex: 20,
            minWidth: 220,
            maxWidth: 320,
            padding: '10px 12px',
            background: 'hsl(var(--rt-ink))',
            color: 'hsl(var(--rt-paper))',
            borderRadius: 4,
            fontSize: 12,
            lineHeight: 1.45,
            fontFamily: 'var(--rt-font-sans)',
            boxShadow: '0 8px 20px rgba(0,0,0,.18)',
            whiteSpace: 'normal',
            pointerEvents: 'none',
          }}
        >
          {description}
        </span>
      )}
    </span>
  );
}
