import type { RatingModelListItem } from '@/lib/api/types/rating';

const BASE = 'https://hvac-info.com';

type ItemListJsonLd = {
  '@context': 'https://schema.org';
  '@type': 'ItemList';
  name: string;
  numberOfItems: number;
  itemListElement: Array<{
    '@type': 'ListItem';
    position: number;
    url: string;
    name: string;
  }>;
};

function buildItemListJsonLd(models: RatingModelListItem[]): ItemListJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Рейтинг кондиционеров «Август-климат»',
    numberOfItems: models.length,
    itemListElement: models.map((m, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE}/rating-split-system/${m.slug}`,
      name: `${m.brand} ${m.inner_unit}`.trim(),
    })),
  };
}

export default function RatingItemListJsonLd({
  models,
}: {
  models: RatingModelListItem[];
}) {
  if (models.length === 0) return null;
  const data = buildItemListJsonLd(models);
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export { buildItemListJsonLd };
