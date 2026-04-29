'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RatingModelListItem } from '@/lib/api/types/rating';
import { getRatingModels } from '@/lib/api/services/rating';

type NewsLite = {
  id: number;
  title: string;
  pub_date?: string;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

type Cache = {
  models: RatingModelListItem[];
  news: NewsLite[];
  at: number;
} | null;

let sharedCache: Cache = null;

async function loadData(): Promise<{ models: RatingModelListItem[]; news: NewsLite[] }> {
  if (sharedCache && Date.now() - sharedCache.at < CACHE_TTL_MS) {
    return { models: sharedCache.models, news: sharedCache.news };
  }
  const [modelsRes, newsRes] = await Promise.allSettled([
    getRatingModels(),
    fetch('/api/hvac/news/?page=1&page_size=30', {
      headers: { Accept: 'application/json' },
    }).then((r) => (r.ok ? r.json() : { results: [] })),
  ]);
  const models =
    modelsRes.status === 'fulfilled'
      ? modelsRes.value.filter((m) => m.publish_status === 'published')
      : [];
  const newsResults = newsRes.status === 'fulfilled' ? newsRes.value : { results: [] };
  const news: NewsLite[] = Array.isArray(newsResults?.results)
    ? newsResults.results.map((n: { id: number; title: string; pub_date?: string }) => ({
        id: n.id,
        title: n.title,
        pub_date: n.pub_date,
      }))
    : [];
  sharedCache = { models, news, at: Date.now() };
  return { models, news };
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SearchDialog({ open, onClose }: Props) {
  const [q, setQ] = useState('');
  const [models, setModels] = useState<RatingModelListItem[]>([]);
  const [news, setNews] = useState<NewsLite[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // Если кеш горячий — синхронный пэйлоуд из loadData без лоадера.
    setLoading(true);
    let cancelled = false;
    loadData()
      .then((data) => {
        if (cancelled) return;
        setModels(data.models);
        setNews(data.news);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // autofocus с задержкой, чтобы не сбивался Enter-клик по кнопке-открытию
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const filteredModels = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];
    return models
      .filter((m) => {
        const hay = `${m.brand} ${m.inner_unit} ${m.series}`.toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 10);
  }, [q, models]);

  const filteredNews = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];
    return news
      .filter((n) => n.title.toLowerCase().includes(query))
      .slice(0, 5);
  }, [q, news]);

  if (!open) return null;

  const showEmpty = q.trim().length < 2;
  const showNoResults =
    q.trim().length >= 2 &&
    filteredModels.length === 0 &&
    filteredNews.length === 0 &&
    !loading;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Поиск"
      data-testid="search-dialog"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '10vh 16px 16px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'hsl(var(--rt-paper))',
          borderRadius: 8,
          boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 18px',
            borderBottom: '1px solid hsl(var(--rt-border-subtle))',
          }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden style={{ color: 'hsl(var(--rt-ink-40))' }}>
            <circle cx={11} cy={11} r={7} />
            <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Марка, модель кондиционера, новость…"
            aria-label="Поиск"
            data-testid="search-input"
            style={{
              flex: 1,
              border: 0,
              outline: 'none',
              background: 'transparent',
              fontSize: 15,
              color: 'hsl(var(--rt-ink))',
              fontFamily: 'var(--rt-font-sans)',
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть поиск"
            style={{
              background: 'transparent',
              border: 0,
              color: 'hsl(var(--rt-ink-60))',
              fontSize: 13,
              cursor: 'pointer',
              padding: '4px 6px',
              fontFamily: 'var(--rt-font-mono)',
              letterSpacing: 0.5,
            }}
          >
            Esc
          </button>
        </div>

        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {showEmpty && (
            <div style={{ padding: '24px 18px', fontSize: 13, color: 'hsl(var(--rt-ink-60))' }}>
              Начните набирать — поиск по моделям и новостям.
            </div>
          )}
          {showNoResults && (
            <div
              data-testid="search-no-results"
              style={{ padding: '24px 18px', fontSize: 13, color: 'hsl(var(--rt-ink-60))' }}
            >
              Ничего не найдено по запросу «{q.trim()}».
            </div>
          )}
          {filteredModels.length > 0 && (
            <section>
              <SectionLabel>Модели</SectionLabel>
              {filteredModels.map((m) => (
                <Link
                  key={m.id}
                  href={`/konditsioner/${m.slug}/`}
                  onClick={onClose}
                  style={resultLinkStyle}
                  data-testid="search-model-result"
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--rt-ink))' }}>
                      {m.brand}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'hsl(var(--rt-ink-60))',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {m.inner_unit || m.series || '—'}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: 'hsl(var(--rt-ink-40))' }}>→</span>
                </Link>
              ))}
            </section>
          )}
          {filteredNews.length > 0 && (
            <section>
              <SectionLabel>Новости</SectionLabel>
              {filteredNews.map((n) => (
                <Link
                  key={n.id}
                  href={`/news/${n.id}`}
                  onClick={onClose}
                  style={resultLinkStyle}
                  data-testid="search-news-result"
                >
                  <div
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: 'hsl(var(--rt-ink))',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {n.title}
                  </div>
                  <span style={{ fontSize: 12, color: 'hsl(var(--rt-ink-40))' }}>→</span>
                </Link>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '10px 18px 6px',
        fontFamily: 'var(--rt-font-mono)',
        fontSize: 10,
        color: 'hsl(var(--rt-ink-40))',
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

const resultLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 18px',
  textDecoration: 'none',
  color: 'hsl(var(--rt-ink))',
  borderTop: '1px solid hsl(var(--rt-border-subtle))',
};

/** Вспомогательная функция для фильтрации — экспортируется для unit-тестов. */
export function filterModels(models: RatingModelListItem[], q: string): RatingModelListItem[] {
  const query = q.trim().toLowerCase();
  if (query.length < 2) return [];
  return models
    .filter((m) => `${m.brand} ${m.inner_unit} ${m.series}`.toLowerCase().includes(query))
    .slice(0, 10);
}

export function filterNews<T extends { title: string }>(items: T[], q: string): T[] {
  const query = q.trim().toLowerCase();
  if (query.length < 2) return [];
  return items.filter((n) => n.title.toLowerCase().includes(query)).slice(0, 5);
}
