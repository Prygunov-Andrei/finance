import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import HvacInfoHeader from '@/components/hvac-info/HvacInfoHeader';
import BreadcrumbJsonLd from '../../rating-split-system/_components/BreadcrumbJsonLd';
import { getAllNews, getNewsById } from '@/lib/hvac-api';
import { getNewsPrimaryImageUrl, stripHtml, truncate } from '@/lib/utils';
import NewsBreadcrumb from './_components/NewsBreadcrumb';
import NewsArticleHero from './_components/NewsArticleHero';
import NewsArticleBody from './_components/NewsArticleBody';
import NewsMentionedModelCard from './_components/NewsMentionedModelCard';
import NewsPrevNextNav from './_components/NewsPrevNextNav';
import SectionFooter from '../../_components/SectionFooter';
import {
  getNewsBodyWithoutHero,
  getNewsCategoryLabel,
  getNewsLede,
  prevNextFromIndex,
} from '../../_components/newsHelpers';

export const revalidate = 3600;

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  try {
    const all = await getAllNews();
    return all.slice(0, 50).map((n) => ({ id: String(n.id) }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const news = await getNewsById(Number(id));
    const description = truncate(
      getNewsLede(news, 160) || stripHtml(news.body || ''),
      160,
    );
    const imageUrl = getNewsPrimaryImageUrl(news);
    // Wave 10.3: OG image absolute. До мержа backend-абсолютизации префиксуем
    // вручную; после — startsWith('http') graceful обрабатывает оба варианта.
    const absoluteImage = imageUrl
      ? imageUrl.startsWith('http')
        ? imageUrl
        : `https://hvac-info.com${imageUrl}`
      : null;

    return {
      title: news.title,
      description,
      alternates: { canonical: `/news/${id}` },
      openGraph: {
        title: news.title,
        description,
        type: 'article',
        publishedTime: news.pub_date,
        modifiedTime: news.updated_at,
        images: absoluteImage ? [{ url: absoluteImage }] : [],
      },
    };
  } catch {
    return { title: 'Новость не найдена' };
  }
}

export default async function NewsDetailPage({ params }: Props) {
  const { id } = await params;
  const numericId = Number(id);

  let news;
  let allNews: Awaited<ReturnType<typeof getAllNews>> = [];
  try {
    [news, allNews] = await Promise.all([
      getNewsById(numericId),
      getAllNews().catch(() => []),
    ]);
  } catch {
    notFound();
  }

  const { prev, next } = prevNextFromIndex(allNews, news.id);
  const imageUrl = getNewsPrimaryImageUrl(news);

  return (
    <>
      <HvacInfoHeader />
      <BreadcrumbJsonLd
        crumbs={[
          { name: 'Главная', url: 'https://hvac-info.com/' },
          { name: 'Новости', url: 'https://hvac-info.com/' },
          { name: news.title },
        ]}
      />
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

      <article
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '8px 40px 28px',
        }}
        className="rt-article-wrap"
      >
        <NewsBreadcrumb category={getNewsCategoryLabel(news)} />
        <NewsArticleHero news={news} />
        <NewsArticleBody body={getNewsBodyWithoutHero(news)} />

        {news.mentioned_ac_models && news.mentioned_ac_models.length > 0 && (
          <NewsMentionedModelCard models={news.mentioned_ac_models} />
        )}

        <NewsPrevNextNav prev={prev} next={next} />

        {news.source_url && (
          <footer
            style={{
              marginTop: 32,
              paddingTop: 18,
              borderTop: '1px solid hsl(var(--rt-border-subtle))',
              fontSize: 12,
              color: 'hsl(var(--rt-ink-60))',
            }}
          >
            Источник:{' '}
            <a
              href={news.source_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'hsl(var(--rt-accent))', textDecoration: 'none' }}
            >
              {(() => {
                try {
                  return new URL(news.source_url).hostname;
                } catch {
                  return news.source_url;
                }
              })()}
            </a>
          </footer>
        )}

        <div style={{ marginTop: 26, textAlign: 'center' }}>
          <Link
            href="/"
            style={{
              fontSize: 12,
              color: 'hsl(var(--rt-ink-60))',
              textDecoration: 'none',
              fontFamily: 'var(--rt-font-mono)',
              letterSpacing: 0.3,
            }}
          >
            ← Вернуться ко всем новостям
          </Link>
        </div>
      </article>

      <SectionFooter />

      <style>{`
        @media (max-width: 1023px) {
          .rt-article-wrap { padding: 4px 16px 24px !important; }
        }
      `}</style>
    </>
  );
}
