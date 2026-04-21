export const dynamic = "force-dynamic";
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { PublicLayout } from '@/components/public/PublicLayout';
import { getNewsById } from '@/lib/hvac-api';
import { formatDate, getNewsPrimaryImageUrl, stripHtml, truncate } from '@/lib/utils';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const news = await getNewsById(Number(id));
    const description = truncate(stripHtml(news.body || ''), 160);
    const imageUrl = getNewsPrimaryImageUrl(news);

    return {
      title: news.title,
      description,
      openGraph: {
        title: news.title,
        description,
        type: 'article',
        publishedTime: news.pub_date,
        modifiedTime: news.updated_at,
        images: imageUrl ? [{ url: imageUrl }] : [],
      },
    };
  } catch {
    return { title: 'Новость не найдена' };
  }
}

export default async function NewsDetailPage({ params }: Props) {
  const { id } = await params;
  let news;
  try {
    news = await getNewsById(Number(id));
  } catch {
    notFound();
  }

  const imageUrl = getNewsPrimaryImageUrl(news);

  return (
    <PublicLayout>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            headline: news.title,
            datePublished: news.pub_date,
            dateModified: news.updated_at,
            author: {
              '@type': 'Organization',
              name: 'HVAC Info',
              url: 'https://hvac-info.com',
            },
            publisher: {
              '@type': 'Organization',
              name: 'HVAC Info',
              url: 'https://hvac-info.com',
            },
            image: imageUrl || undefined,
            articleBody: stripHtml(news.body || ''),
            mainEntityOfPage: `https://hvac-info.com/news/${news.id}`,
          }),
        }}
      />

      <article className="max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          <Link href="/" className="hover:text-blue-600">Новости</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 dark:text-gray-100">{truncate(news.title, 50)}</span>
        </nav>

        {/* Header */}
        <header className="mb-8">
          <time dateTime={news.pub_date} className="text-sm text-gray-500 dark:text-gray-400">
            {formatDate(news.pub_date)}
          </time>
          {news.manufacturer && (
            <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {news.manufacturer.name}
            </span>
          )}
          <h1 className="mt-3 text-3xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
            {news.title}
          </h1>
        </header>

        {/* Image */}
        {imageUrl && (
          <figure className="mb-8">
            <img
              src={imageUrl}
              alt={news.title}
              className="w-full rounded-lg"
            />
          </figure>
        )}

        {/* Body */}
        <section
          className="prose prose-lg max-w-none"
          dangerouslySetInnerHTML={{ __html: news.body }}
        />

        {/* Source */}
        {news.source_url && (
          <footer className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Источник:{' '}
              <a
                href={news.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {new URL(news.source_url).hostname}
              </a>
            </p>
          </footer>
        )}
      </article>
    </PublicLayout>
  );
}
