import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getRatingMethodology,
  getRatingModelBySlug,
  getRatingModels,
} from '@/lib/api/services/rating';
import type { RatingModelDetail } from '@/lib/api/types/rating';
import HvacInfoHeader from '@/components/hvac-info/HvacInfoHeader';
import BackToRating from '../_components/BackToRating';
import DetailHero, { DetailHeroCollapsed } from '../_components/DetailHero';
import DetailMedia from '../_components/DetailMedia';
import DetailAnchorNav from '../_components/DetailAnchorNav';
import StickyCollapseHero from '../_components/StickyCollapseHero';
import DetailOverview from '../_components/DetailOverview';
import DetailCriteria from '../_components/DetailCriteria';
import DetailIndexViz from '../_components/DetailIndexViz';
import DetailSpecs from '../_components/DetailSpecs';
import DetailBuy from '../_components/DetailBuy';
import DetailReviews from '../_components/DetailReviews';
import ModelJsonLd from '../_components/ModelJsonLd';
import BreadcrumbJsonLd from '../_components/BreadcrumbJsonLd';
import SectionFooter from '../../_components/SectionFooter';
import { fallbackLede } from '../_components/detailHelpers';

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

async function loadDetail(slug: string): Promise<RatingModelDetail | null> {
  try {
    return await getRatingModelBySlug(slug);
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  try {
    const models = await getRatingModels();
    return models
      .filter((m) => m.publish_status === 'published')
      .map((m) => ({ slug: m.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const detail = await loadDetail(slug);
  if (!detail) {
    return {
      title: 'Модель не найдена',
    };
  }
  const descSource = (detail.editorial_lede || fallbackLede(detail)).trim();
  const description = descSource.slice(0, 160);
  const seriesPart = detail.series?.trim() ? ` серии ${detail.series.trim()}` : '';
  const title = `Кондиционер ${detail.brand.name} ${detail.inner_unit}${seriesPart} — независимый рейтинг, обзор и отзывы`;
  const firstPhoto = detail.photos?.[0]?.image_url;
  // Wave 10.3: OG image обязан быть absolute. Backend AC-Петя параллельно
  // меняет _url_with_mtime на absolute; до его merge guard вручную, после —
  // startsWith('http') graceful обрабатывает оба варианта.
  const ogImage = firstPhoto
    ? firstPhoto.startsWith('http')
      ? firstPhoto
      : `https://hvac-info.com${firstPhoto}`
    : null;

  return {
    title,
    description,
    alternates: { canonical: `/rating-split-system/${slug}` },
    openGraph: {
      title,
      description,
      type: 'article',
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
  };
}

export default async function RatingDetailPage({ params }: Props) {
  const { slug } = await params;
  const detail = await loadDetail(slug);
  if (!detail) notFound();

  let list: Awaited<ReturnType<typeof getRatingModels>> = [];
  let methodology: Awaited<ReturnType<typeof getRatingMethodology>> | null = null;
  try {
    [list, methodology] = await Promise.all([
      getRatingModels(),
      getRatingMethodology(),
    ]);
  } catch {
    // Некритично: если список/методика недоступны, рендерим с partial-data.
  }

  const allScores = list.map((m) => m.total_index);
  const totalModels =
    methodology?.stats.total_models ?? Math.max(list.length, 1);
  const median =
    detail.median_total_index ??
    methodology?.stats.median_total_index ??
    computeMedian(allScores);

  return (
    <>
      <ModelJsonLd detail={detail} />
      <BreadcrumbJsonLd
        crumbs={[
          { name: 'Главная', url: 'https://hvac-info.com/' },
          { name: 'Рейтинг кондиционеров', url: 'https://hvac-info.com/rating-split-system' },
          { name: `${detail.brand.name} ${detail.inner_unit}`.trim() },
        ]}
      />
      <HvacInfoHeader />
      <main className="hvac-content">
        <BackToRating />
        <h1
          style={{
            fontFamily: 'var(--rt-font-serif)',
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: -0.1,
            color: 'hsl(var(--rt-ink-60))',
            margin: '0 0 8px 0',
          }}
        >
          Кондиционер {detail.brand.name} {detail.inner_unit}
          {detail.outer_unit ? ` / ${detail.outer_unit}` : ''}
        </h1>
      </main>
      <StickyCollapseHero
        full={
          <DetailHero
            detail={detail}
            stats={{
              total_models: totalModels,
              active_criteria_count:
                methodology?.stats.active_criteria_count ?? detail.parameter_scores.length,
              median_total_index: median,
            }}
            median={median}
          />
        }
        collapsed={
          <DetailHeroCollapsed
            detail={detail}
            stats={{
              total_models: totalModels,
              active_criteria_count:
                methodology?.stats.active_criteria_count ?? detail.parameter_scores.length,
              median_total_index: median,
            }}
          />
        }
      />
      <main className="hvac-content">
        <DetailMedia detail={detail} />
        <DetailAnchorNav />
        <DetailCriteria
          detail={detail}
          activeCriteriaCount={
            methodology?.stats.active_criteria_count ?? detail.parameter_scores.length
          }
          methodology={methodology}
        />
        <DetailIndexViz
          totalIndex={detail.total_index}
          median={median}
          allScores={allScores}
          rank={detail.rank}
          totalModels={totalModels}
        />
        <DetailSpecs detail={detail} methodology={methodology} />
        <DetailBuy detail={detail} />
        <DetailReviews detail={detail} />
        <DetailOverview detail={detail} />
      </main>
      <SectionFooter />
    </>
  );
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
