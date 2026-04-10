'use client';

import { useState, useEffect, useCallback } from 'react';
import { NewsCard } from './NewsCard';
import { NewsListView } from './NewsListView';
import { NewsFilters, type NewsFilterState } from './NewsFilters';
import type { NewsItem } from '@/lib/hvac-api';

interface LoadMoreNewsProps {
  initialNews: NewsItem[];
  hasMore: boolean;
  totalCount: number;
}

export function LoadMoreNews({ initialNews, hasMore, totalCount }: LoadMoreNewsProps) {
  const [news, setNews] = useState<NewsItem[]>(initialNews ?? []);
  const [page, setPage] = useState(2);
  const [loading, setLoading] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(hasMore);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [filters, setFilters] = useState<NewsFilterState>({ starRating: [5], region: '', month: '' });

  useEffect(() => {
    const saved = localStorage.getItem('news_view_mode') as 'list' | 'grid';
    if (saved) setViewMode(saved);
  }, []);

  const toggleViewMode = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('news_view_mode', mode);
  };

  const buildQueryParams = useCallback((pageNum: number, currentFilters: NewsFilterState) => {
    const params = new URLSearchParams({ page: String(pageNum) });
    if (currentFilters.starRating.length > 0) {
      params.set('star_rating', currentFilters.starRating.join(','));
    }
    if (currentFilters.region) {
      params.set('region', currentFilters.region);
    }
    if (currentFilters.month) {
      params.set('month', currentFilters.month);
    }
    return params.toString();
  }, []);

  const loadFiltered = useCallback(async (newFilters: NewsFilterState) => {
    setLoading(true);
    try {
      const query = buildQueryParams(1, newFilters);
      const res = await fetch(`/api/hvac/news/?${query}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const results = Array.isArray(data) ? data : (data.results ?? []);
      setNews(results);
      setPage(2);
      setCanLoadMore(Array.isArray(data) ? false : !!data.next);
    } catch (err) {
      console.error('Failed to load filtered news:', err);
    } finally {
      setLoading(false);
    }
  }, [buildQueryParams]);

  const handleFilterChange = (newFilters: NewsFilterState) => {
    setFilters(newFilters);
    loadFiltered(newFilters);
  };

  const loadMore = async () => {
    setLoading(true);
    try {
      const query = buildQueryParams(page, filters);
      const res = await fetch(`/api/hvac/news/?${query}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      const moreResults = Array.isArray(data) ? data : (data.results ?? []);
      setNews((prev) => [...prev, ...moreResults]);
      setPage((p) => p + 1);
      setCanLoadMore(Array.isArray(data) ? false : !!data.next);
    } catch (err) {
      console.error('Failed to load more news:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <NewsFilters onChange={handleFilterChange} />

      {/* View mode toggle */}
      <div className="flex items-center justify-end gap-1 mb-4">
        <button
          onClick={() => toggleViewMode('list')}
          className={`p-2 rounded-md transition-colors ${
            viewMode === 'list'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
          aria-label="Список"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button
          onClick={() => toggleViewMode('grid')}
          className={`p-2 rounded-md transition-colors ${
            viewMode === 'grid'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
          aria-label="Плитки"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </button>
      </div>

      {news.length === 0 && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          Новости не найдены по выбранным фильтрам
        </div>
      )}

      {viewMode === 'list' ? (
        <div className="space-y-4">
          {news.map((item) => (
            <NewsListView key={item.id} news={item} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {news.map((item) => (
            <NewsCard key={item.id} news={item} />
          ))}
        </div>
      )}

      {canLoadMore && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="rounded-lg bg-primary/10 px-6 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
          >
            {loading ? 'Загрузка...' : `Показать ещё (${news.length} из ${totalCount})`}
          </button>
        </div>
      )}
    </>
  );
}
