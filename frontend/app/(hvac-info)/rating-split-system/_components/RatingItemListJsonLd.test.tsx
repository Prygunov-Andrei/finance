import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RatingModelListItem } from '@/lib/api/types/rating';
import RatingItemListJsonLd, { buildItemListJsonLd } from './RatingItemListJsonLd';

function makeModel(overrides: Partial<RatingModelListItem> = {}): RatingModelListItem {
  return {
    id: 1,
    slug: 'mdv-aurora',
    brand: 'MDV',
    brand_logo: '',
    inner_unit: 'AURORA-09H',
    series: '',
    nominal_capacity: 2.6,
    total_index: 78.5,
    index_max: 100,
    publish_status: 'published',
    region_availability: [],
    price: '32000',
    noise_score: null,
    has_noise_measurement: false,
    scores: {},
    is_ad: false,
    ad_position: null,
    rank: 1,
    ...overrides,
  };
}

describe('RatingItemListJsonLd', () => {
  it('строит ItemList с absolute URL и position 1..N', () => {
    const data = buildItemListJsonLd([
      makeModel({ slug: 'mdv-a', inner_unit: 'A' }),
      makeModel({ slug: 'mdv-b', inner_unit: 'B' }),
      makeModel({ slug: 'mdv-c', inner_unit: 'C' }),
    ]);
    expect(data['@type']).toBe('ItemList');
    expect(data.numberOfItems).toBe(3);
    expect(data.itemListElement[0].position).toBe(1);
    expect(data.itemListElement[0].url).toBe('https://hvac-info.com/rating-split-system/mdv-a');
    expect(data.itemListElement[2].position).toBe(3);
    expect(data.itemListElement[2].url).toBe('https://hvac-info.com/rating-split-system/mdv-c');
  });

  it('возвращает null если список пустой', () => {
    const html = renderToStaticMarkup(<RatingItemListJsonLd models={[]} />);
    expect(html).toBe('');
  });

  it('рендерит <script type="application/ld+json"> с валидным JSON', () => {
    const html = renderToStaticMarkup(
      <RatingItemListJsonLd models={[makeModel()]} />,
    );
    expect(html).toContain('<script type="application/ld+json">');
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*)<\/script>/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed['@type']).toBe('ItemList');
    expect(parsed.numberOfItems).toBe(1);
  });
});
