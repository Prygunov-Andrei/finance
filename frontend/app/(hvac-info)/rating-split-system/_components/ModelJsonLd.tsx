import type { RatingModelDetail } from '@/lib/api/types/rating';

const BASE = 'https://hvac-info.com';

type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | JsonLdValue[]
  | { [key: string]: JsonLdValue | undefined };

function buildJsonLd(detail: RatingModelDetail): Record<string, JsonLdValue> {
  const url = `${BASE}/rating-split-system/${detail.slug}/`;
  const description =
    detail.editorial_lede?.trim() ||
    `Кондиционер ${detail.brand.name} ${detail.inner_unit} — независимая оценка по методике «Август-климат».`;

  const data: Record<string, JsonLdValue> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${detail.brand.name} ${detail.inner_unit}`.trim(),
    brand: { '@type': 'Brand', name: detail.brand.name },
    sku: detail.slug,
    description,
    url,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: detail.total_index.toFixed(1),
      bestRating: detail.index_max,
      worstRating: 0,
      ratingCount: 1,
    },
  };

  // Wave 10.3: Schema.org Product требует absolute image URL. Backend AC-Петя
  // параллельно меняет _url_with_mtime на absolute; до его merge guard вручную,
  // после — startsWith('http') graceful обрабатывает оба варианта.
  const firstPhoto = detail.photos?.[0]?.image_url;
  if (firstPhoto) {
    data.image = firstPhoto.startsWith('http') ? firstPhoto : `${BASE}${firstPhoto}`;
  }

  if (detail.price) {
    data.offers = {
      '@type': 'Offer',
      price: detail.price,
      priceCurrency: 'RUB',
      availability: 'https://schema.org/InStock',
      url,
    };
  }

  return data;
}

export default function ModelJsonLd({ detail }: { detail: RatingModelDetail }) {
  const data = buildJsonLd(detail);
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export { buildJsonLd };
