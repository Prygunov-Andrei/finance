import Link from 'next/link';
import type { NewsItem } from '@/lib/hvac-api';
import { formatDate, stripHtml, truncate } from '@/lib/utils';

interface NewsCardProps {
  news: NewsItem;
}

export function NewsCard({ news }: NewsCardProps) {
  const imageUrl = news.media?.[0]?.file;
  const bodyPreview = truncate(stripHtml(news.body || ''), 200);

  return (
    <article className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden hover:shadow-md transition-shadow">
      {imageUrl && (
        <Link href={`/news/${news.id}`}>
          <img
            src={imageUrl}
            alt={news.title}
            className="w-full h-48 object-cover"
            loading="lazy"
          />
        </Link>
      )}
      <div className="p-5">
        <time dateTime={news.pub_date} className="text-sm text-gray-500 dark:text-gray-400">
          {formatDate(news.pub_date)}
        </time>
        <h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
          <Link href={`/news/${news.id}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            {news.title}
          </Link>
        </h2>
        {bodyPreview && (
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
            {bodyPreview}
          </p>
        )}
        {news.manufacturer && (
          <div className="mt-3">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
              {news.manufacturer.name}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
