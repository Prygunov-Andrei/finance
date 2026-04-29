import type { CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Рендер тела новости. Если body содержит HTML-теги — рендерим как raw HTML
 * (backend даёт уже очищенный HTML, news.body хранит `<p>`, `<blockquote>` и т.п.).
 * Если plain-text — рендерим как Markdown (заголовки, списки, цитаты, **bold**,
 * GFM-таблицы, чекбоксы) через react-markdown + remark-gfm.
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
    <div style={PROSE_STYLE} className="rt-article-body rt-article-body-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
      <style>{`
        .rt-article-body-md > :first-child { margin-top: 0; }
        .rt-article-body-md p { margin: 0 0 16px; }
        .rt-article-body-md h2 {
          font-family: var(--rt-font-serif);
          font-size: 22px;
          font-weight: 700;
          line-height: 1.25;
          letter-spacing: -0.3px;
          color: hsl(var(--rt-ink));
          margin: 28px 0 12px;
        }
        .rt-article-body-md h3 {
          font-family: var(--rt-font-serif);
          font-size: 18px;
          font-weight: 600;
          line-height: 1.3;
          color: hsl(var(--rt-ink));
          margin: 22px 0 10px;
        }
        .rt-article-body-md h4 {
          font-size: 15px;
          font-weight: 600;
          color: hsl(var(--rt-ink));
          margin: 18px 0 8px;
        }
        .rt-article-body-md ul,
        .rt-article-body-md ol { margin: 0 0 16px; padding-left: 24px; }
        .rt-article-body-md li { margin: 4px 0; }
        .rt-article-body-md li > p { margin: 0 0 4px; }
        .rt-article-body-md strong { color: hsl(var(--rt-ink)); font-weight: 700; }
        .rt-article-body-md em { font-style: italic; }
        .rt-article-body-md a {
          color: hsl(var(--rt-accent));
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .rt-article-body-md code {
          font-family: var(--rt-font-mono);
          font-size: 12.5px;
          padding: 1px 5px;
          background: hsl(var(--rt-alt));
          border-radius: 3px;
        }
        .rt-article-body-md pre {
          margin: 16px 0;
          padding: 14px 16px;
          background: hsl(var(--rt-alt));
          border-radius: 4px;
          overflow-x: auto;
          font-size: 12.5px;
          line-height: 1.5;
        }
        .rt-article-body-md pre code {
          padding: 0;
          background: transparent;
        }
        .rt-article-body-md blockquote {
          margin: 22px 0;
          padding: 18px 22px;
          border-left: 3px solid hsl(var(--rt-accent));
          background: hsl(var(--rt-alt));
          font-family: var(--rt-font-serif);
          font-style: italic;
          font-size: 15px;
          line-height: 1.55;
          color: hsl(var(--rt-ink));
        }
        .rt-article-body-md blockquote p { margin: 0; }
        .rt-article-body-md hr {
          border: 0;
          border-top: 1px solid hsl(var(--rt-border-subtle));
          margin: 24px 0;
        }
        .rt-article-body-md table {
          border-collapse: collapse;
          width: 100%;
          margin: 18px 0;
          font-size: 13px;
        }
        .rt-article-body-md th,
        .rt-article-body-md td {
          padding: 8px 12px;
          border: 1px solid hsl(var(--rt-border-subtle));
          text-align: left;
        }
        .rt-article-body-md th {
          background: hsl(var(--rt-alt));
          font-weight: 600;
        }
      `}</style>
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
