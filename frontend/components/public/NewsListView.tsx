import Link from 'next/link';
import type { NewsItem } from '@/lib/hvac-api';
import { formatDate, getNewsPrimaryImageUrl, stripHtml, truncate } from '@/lib/utils';

interface NewsListViewProps {
  news: NewsItem;
}

export function NewsListView({ news }: NewsListViewProps) {
  const imageUrl = getNewsPrimaryImageUrl(news);
  const bodyPreview = truncate(stripHtml(news.body || ''), 300);

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground transition-shadow hover:shadow-md">
      <div className="flex flex-col md:flex-row">
        {/* Image */}
        {imageUrl && (
          <Link href={`/news/${news.id}`} className="w-full md:w-80 flex-shrink-0">
            <div className="flex min-h-[12rem] h-48 w-full items-center justify-center overflow-hidden bg-muted md:h-full">
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
            <h2 className="text-lg font-semibold text-card-foreground">
              <Link href={`/news/${news.id}`} className="transition-colors hover:text-primary">
                {news.title}
              </Link>
            </h2>
          </div>

          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <time dateTime={news.pub_date}>
              {formatDate(news.pub_date)}
            </time>
            {news.manufacturer && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {news.manufacturer.name}
              </span>
            )}
            {(news as NewsItem & { star_rating?: number }).star_rating != null &&
             (news as NewsItem & { star_rating?: number }).star_rating! >= 4 && (
              <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                {'★'.repeat((news as NewsItem & { star_rating?: number }).star_rating!)}
              </span>
            )}
          </div>

          {bodyPreview && (
            <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
              {bodyPreview}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
