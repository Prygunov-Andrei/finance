'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { HvacNews as NewsItem } from '@/lib/api/types/hvac';
import {
  formatNewsDateShort,
  getNewsCategoryLabel,
  getNewsHeroImage,
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

      {visible.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 20,
          }}
          className="rt-feed-grid"
        >
          {visible.map((item) => {
            const img = getNewsHeroImage(item);
            return (
              <Link
                key={item.id}
                href={`/news/${item.id}`}
                className="rt-feed-card"
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  border: '1px solid hsl(var(--rt-border-subtle))',
                  borderRadius: 4,
                  padding: 16,
                  background: 'hsl(var(--rt-paper))',
                  display: 'block',
                }}
              >
                <div
                  aria-hidden
                  className="rt-feed-card-img"
                  style={{
                    width: '100%',
                    height: 110,
                    marginBottom: 12,
                    borderRadius: 2,
                    background: img
                      ? `center / cover no-repeat url(${img})`
                      : 'repeating-linear-gradient(135deg, hsl(var(--rt-ink-08)) 0 6px, hsl(var(--rt-ink-15)) 6px 12px)',
                    flexShrink: 0,
                  }}
                />
                <div className="rt-feed-card-body" style={{ minWidth: 0 }}>
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
                      marginTop: 6,
                      fontSize: 13,
                      fontWeight: 500,
                      lineHeight: 1.3,
                      color: 'hsl(var(--rt-ink))',
                    }}
                  >
                    {item.title}
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
        @media (max-width: 1023px) {
          .rt-feed-list-wrap { padding: 18px 16px 32px !important; }
          .rt-feed-grid { grid-template-columns: 1fr !important; gap: 10px !important; }
          .rt-feed-card { display: flex !important; gap: 12px; padding: 10px !important; }
          .rt-feed-card-img { width: 72px !important; height: 72px !important; margin-bottom: 0 !important; }
        }
        @media (min-width: 1024px) and (max-width: 1279px) {
          .rt-feed-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
      `}</style>
    </section>
  );
}
