import Link from 'next/link';
import type { NewsItem } from '@/lib/hvac-api';
import { formatDate, stripHtml, truncate } from '@/lib/utils';

interface NewsListViewProps {
  news: NewsItem;
}

export function NewsListView({ news }: NewsListViewProps) {
  const imageUrl = news.media?.[0]?.file;
  const bodyPreview = truncate(stripHtml(news.body || ''), 300);

  return (
    <article className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden hover:shadow-md transition-shadow">
      <div className="flex flex-col md:flex-row">
        {/* Image */}
        {imageUrl && (
          <Link href={`/news/${news.id}`} className="w-full md:w-80 flex-shrink-0">
            <div className="w-full h-48 md:h-full min-h-[12rem] bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
              <img
                src={imageUrl}
                alt={news.title}
                className="max-h-56 object-contain"
                loading="lazy"
              />
            </div>
          </Link>
        )}

        {/* Content */}
        <div className="flex-1 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              <Link href={`/news/${news.id}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                {news.title}
              </Link>
            </h2>
          </div>

          <div className="flex items-center gap-2 mt-2 text-sm text-gray-500 dark:text-gray-400">
            <time dateTime={news.pub_date}>
              {formatDate(news.pub_date)}
            </time>
            {news.manufacturer && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
                {news.manufacturer.name}
              </span>
            )}
          </div>

          {bodyPreview && (
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
              {bodyPreview}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
