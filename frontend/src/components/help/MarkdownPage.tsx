import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Alert, AlertDescription } from '../ui/alert';
import { Loader2, FileText, ChevronRight } from 'lucide-react';

interface MarkdownPageProps {
  filePath: string;
}

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

export const MarkdownPage = ({ filePath }: MarkdownPageProps) => {
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    fetch(`/help/${filePath}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Файл не найден: ${filePath}`);
        return res.text();
      })
      .then((text) => {
        setContent(text);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [filePath]);

  const toc = useMemo<TocEntry[]>(() => {
    if (!content) return [];
    const headingRegex = /^(#{1,3})\s+(.+)$/gm;
    const entries: TocEntry[] = [];
    let match;
    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = text.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/(^-|-$)/g, '');
      entries.push({ id, text, level });
    }
    return entries;
  }, [content]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 flex gap-8 max-w-7xl mx-auto">
      <article className="flex-1 min-w-0 prose prose-slate max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children, ...props }) => {
              const text = String(children);
              const id = text.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/(^-|-$)/g, '');
              return <h1 id={id} {...props}>{children}</h1>;
            },
            h2: ({ children, ...props }) => {
              const text = String(children);
              const id = text.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/(^-|-$)/g, '');
              return <h2 id={id} {...props}>{children}</h2>;
            },
            h3: ({ children, ...props }) => {
              const text = String(children);
              const id = text.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/(^-|-$)/g, '');
              return <h3 id={id} {...props}>{children}</h3>;
            },
            table: ({ children, ...props }) => (
              <div className="overflow-x-auto">
                <table className="border-collapse border border-gray-300" {...props}>{children}</table>
              </div>
            ),
            th: ({ children, ...props }) => (
              <th className="border border-gray-300 bg-gray-50 px-4 py-2 text-left font-medium" {...props}>{children}</th>
            ),
            td: ({ children, ...props }) => (
              <td className="border border-gray-300 px-4 py-2" {...props}>{children}</td>
            ),
          }}
        >
          {content || ''}
        </ReactMarkdown>
      </article>

      {toc.length > 3 && (
        <nav className="hidden lg:block w-64 shrink-0 sticky top-6 self-start" aria-label="Оглавление">
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1">
            <FileText className="w-4 h-4" />
            Содержание
          </h4>
          <ul className="space-y-1 text-sm">
            {toc.map((entry) => (
              <li key={entry.id} style={{ paddingLeft: `${(entry.level - 1) * 12}px` }}>
                <a
                  href={`#${entry.id}`}
                  className="flex items-center gap-1 text-gray-600 hover:text-blue-600 transition-colors py-0.5"
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span className="truncate">{entry.text}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
};
