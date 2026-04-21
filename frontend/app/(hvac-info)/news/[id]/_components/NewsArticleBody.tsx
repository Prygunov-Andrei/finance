import type { CSSProperties, ReactNode } from 'react';

/**
 * Рендер тела новости. Если body содержит HTML-теги — рендерим как raw HTML
 * (backend даёт уже очищенный HTML, news.body хранит `<p>`, `<blockquote>` и т.п.).
 * Если plain-text — split по \n\n → <p>, строки начинающиеся с `> ` → blockquote.
 */
export default function NewsArticleBody({ body }: { body: string }) {
  const hasHtml = /<[a-z][\s\S]*>/i.test(body);

  if (hasHtml) {
    return (
      <div
        style={PROSE_STYLE}
        className="rt-article-body"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    );
  }

  return (
    <div style={PROSE_STYLE} className="rt-article-body">
      {renderPlainBlocks(body)}
    </div>
  );
}

const PROSE_STYLE: CSSProperties = {
  marginTop: 28,
  fontSize: 14,
  lineHeight: 1.7,
  color: 'hsl(var(--rt-ink-80))',
  fontFamily: 'var(--rt-font-sans)',
};

function renderPlainBlocks(body: string): ReactNode {
  const blocks = body
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks.map((block, i) => {
    const quoteLines = block.split('\n').every((l) => l.trim().startsWith('>'));
    if (quoteLines) {
      const inner = block
        .split('\n')
        .map((l) => l.replace(/^>\s?/, ''))
        .join(' ')
        .trim();
      return (
        <blockquote
          key={i}
          style={{
            margin: '22px 0',
            padding: '20px 24px',
            borderLeft: '3px solid hsl(var(--rt-accent))',
            background: 'hsl(var(--rt-alt))',
            fontFamily: 'var(--rt-font-serif)',
            fontStyle: 'italic',
            fontSize: 15,
            lineHeight: 1.55,
            color: 'hsl(var(--rt-ink))',
          }}
        >
          {inner}
        </blockquote>
      );
    }
    return (
      <p key={i} style={{ margin: '0 0 16px' }}>
        {block.split('\n').map((line, j, arr) => (
          <span key={j}>
            {line}
            {j < arr.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
}
