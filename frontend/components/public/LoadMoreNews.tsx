'use client';

import { useState, useEffect } from 'react';
import { NewsCard } from './NewsCard';
import { NewsListView } from './NewsListView';
import type { NewsItem } from '@/lib/hvac-api';

interface LoadMoreNewsProps {
  initialNews: NewsItem[];
  hasMore: boolean;
  totalCount: number;
}

export function LoadMoreNews({ initialNews, hasMore, totalCount }: LoadMoreNewsProps) {
  const [news, setNews] = useState<NewsItem[]>(initialNews);
  const [page, setPage] = useState(2);
  const [loading, setLoading] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(hasMore);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    const saved = localStorage.getItem('news_view_mode') as 'list' | 'grid';
    if (saved) setViewMode(saved);
  }, []);

  const toggleViewMode = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('news_view_mode', mode);
  };

  const loadMore = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/hvac/news/?page=${page}`);
      const data = await res.json();
      setNews((prev) => [...prev, ...data.results]);
      setPage((p) => p + 1);
      setCanLoadMore(!!data.next);
    } catch (err) {
      console.error('Failed to load more news:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* View mode toggle */}
      <div className="flex items-center justify-end gap-1 mb-4">
        <button
          onClick={() => toggleViewMode('list')}
          className={`p-2 rounded-md transition-colors ${
            viewMode === 'list'
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
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
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
          aria-label="Плитки"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </button>
      </div>

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
            className="px-6 py-3 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50"
          >
            {loading ? 'Загрузка...' : `Показать ещё (${news.length} из ${totalCount})`}
          </button>
        </div>
      )}
    </>
  );
}
