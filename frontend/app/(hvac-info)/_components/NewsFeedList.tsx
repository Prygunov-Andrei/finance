'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { HvacNews as NewsItem } from '@/lib/api/types/hvac';
import {
  formatNewsDateShort,
  getNewsCategoryLabel,
  getNewsHeroImage,
  getNewsLede,
} from './newsHelpers';

interface Props {
  items: NewsItem[];
  hasMore: boolean;
  totalCount: number;
  skipFirst?: number;
}

export default function NewsFeedList({ items, hasMore, totalCount, skipFirst = 0 }: Props) {
  const [all, setAll] = useState<NewsItem[]>(items);
  const [page, setPage] = useState(2);
  const [canLoadMore, setCanLoadMore] = useState(hasMore);
  const [loading, setLoading] = useState(false);

  const params = useSearchParams();
  const category = params?.get('category') || 'all';
  const view: 'grid' | 'list' = params?.get('view') === 'list' ? 'list' : 'grid';

  const filtered = useMemo(() => {
    if (category === 'all') return all;
    return all.filter((n) => (n.category || '').toString() === category);
  }, [all, category]);

  const visible = filtered.slice(skipFirst);

  const loadMore = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/hvac/news/?page=${page}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const more: NewsItem[] = Array.isArray(data) ? data : (data.results ?? []);
      setAll((prev) => [...prev, ...more]);
      setPage((p) => p + 1);
      setCanLoadMore(Array.isArray(data) ? false : !!data.next);
    } catch (err) {
      console.error('NewsFeedList: load more failed', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ padding: '28px 40px 40px' }} className="rt-feed-list-wrap">
      {visible.length === 0 && (
        <div
          style={{
            padding: '32px 12px',
            textAlign: 'center',
            color: 'hsl(var(--rt-ink-40))',
            fontSize: 13,
          }}
        >
          В этой категории пока нет публикаций.
        </div>
      )}

      {visible.length > 0 && view === 'grid' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 20,
          }}
          className="rt-feed-grid"
          data-view="grid"
        >
          {visible.map((item) => {
            const img = getNewsHeroImage(item);
            const hasImage = Boolean(img);
            return (
              <Link
                key={item.id}
                href={`/news/${item.id}`}
                className="rt-feed-card"
                data-no-image={hasImage ? undefined : 'true'}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  border: '1px solid hsl(var(--rt-border-subtle))',
                  borderRadius: 4,
                  padding: 16,
                  background: 'hsl(var(--rt-paper))',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                }}
              >
                {hasImage && (
                  <div
                    aria-hidden
                    className="rt-feed-card-img"
                    style={{
                      width: '100%',
                      aspectRatio: '16 / 9',
                      marginBottom: 12,
                      borderRadius: 2,
                      background: `center / cover no-repeat url(${img})`,
                      flexShrink: 0,
                    }}
                  />
                )}
                <div
                  className="rt-feed-card-body"
                  style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: 'hsl(var(--rt-ink-40))',
                      fontFamily: 'var(--rt-font-mono)',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}
                  >
                    {formatNewsDateShort(item.pub_date)} · {getNewsCategoryLabel(item)}
                  </div>
                  <div
                    className="rt-feed-card-title"
                    style={
                      hasImage
                        ? {
                            marginTop: 6,
                            fontSize: 13,
                            fontWeight: 500,
                            lineHeight: 1.3,
                            color: 'hsl(var(--rt-ink))',
                          }
                        : {
                            marginTop: 8,
                            fontSize: 19,
                            fontFamily: 'var(--rt-font-serif)',
                            fontWeight: 600,
                            lineHeight: 1.25,
                            letterSpacing: -0.2,
                            color: 'hsl(var(--rt-ink))',
                          }
                    }
                  >
                    {item.title}
                  </div>
                  {!hasImage && (
                    <p
                      className="rt-feed-card-lede"
                      style={{
                        margin: '10px 0 0',
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: 'hsl(var(--rt-ink-60))',
                        display: '-webkit-box',
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        flex: 1,
                      }}
                    >
                      {getNewsLede(item, 220)}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {visible.length > 0 && view === 'list' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
          className="rt-feed-rows"
          data-view="list"
        >
          {visible.map((item) => {
            const img = getNewsHeroImage(item);
            return (
              <Link
                key={item.id}
                href={`/news/${item.id}`}
                className="rt-feed-row"
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'flex',
                  flexDirection: 'row',
                  gap: 16,
                  border: '1px solid hsl(var(--rt-border-subtle))',
                  borderRadius: 4,
                  padding: 12,
                  background: 'hsl(var(--rt-paper))',
                }}
              >
                <div
                  aria-hidden
                  className="rt-feed-row-img"
                  style={{
                    width: 200,
                    height: 120,
                    flexShrink: 0,
                    borderRadius: 4,
                    background: img
                      ? `center / cover no-repeat url(${img})`
                      : 'repeating-linear-gradient(135deg, hsl(var(--rt-ink-08)) 0 6px, hsl(var(--rt-ink-15)) 6px 12px)',
                  }}
                />
                <div
                  className="rt-feed-row-body"
                  style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: 'hsl(var(--rt-ink-40))',
                      fontFamily: 'var(--rt-font-mono)',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }}
                  >
                    {formatNewsDateShort(item.pub_date)} · {getNewsCategoryLabel(item)}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontFamily: 'var(--rt-font-serif)',
                      fontWeight: 700,
                      lineHeight: 1.25,
                      color: 'hsl(var(--rt-ink))',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {item.title}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.45,
                      color: 'hsl(var(--rt-ink-60))',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {getNewsLede(item, 180)}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {canLoadMore && category === 'all' && (
        <div style={{ marginTop: 26, display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: 500,
              border: '1px solid hsl(var(--rt-border))',
              background: 'hsl(var(--rt-btn))',
              color: 'hsl(var(--rt-ink-80))',
              borderRadius: 4,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.6 : 1,
              fontFamily: 'var(--rt-font-sans)',
            }}
          >
            {loading ? 'Загрузка…' : `Показать ещё (${all.length} из ${totalCount})`}
          </button>
        </div>
      )}

      <style>{`
        .rt-feed-card:hover,
        .rt-feed-row:hover {
          border-color: hsl(var(--rt-accent)) !important;
        }
        @media (max-width: 1023px) {
          .rt-feed-list-wrap { padding: 18px 16px 32px !important; }
          .rt-feed-grid { grid-template-columns: 1fr !important; gap: 10px !important; }
          .rt-feed-card { flex-direction: row !important; gap: 12px; padding: 10px !important; height: auto !important; }
          .rt-feed-card-img {
            width: 72px !important;
            height: 72px !important;
            aspect-ratio: 1 / 1 !important;
            margin-bottom: 0 !important;
            flex-shrink: 0;
          }
          .rt-feed-card[data-no-image="true"] .rt-feed-card-title { font-size: 16px !important; }
          .rt-feed-card[data-no-image="true"] .rt-feed-card-lede { -webkit-line-clamp: 3 !important; }
        }
        @media (min-width: 1024px) and (max-width: 1279px) {
          .rt-feed-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 768px) {
          .rt-feed-row {
            flex-direction: column !important;
            gap: 10px !important;
            padding: 10px !important;
          }
          .rt-feed-row-img {
            width: 100% !important;
            height: 180px !important;
          }
        }
      `}</style>
    </section>
  );
}
