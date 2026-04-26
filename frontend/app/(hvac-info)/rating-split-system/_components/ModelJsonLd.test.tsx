import { describe, expect, it } from 'vitest';
import type { RatingModelDetail } from '@/lib/api/types/rating';
import ModelJsonLd, { buildJsonLd } from './ModelJsonLd';
import { renderToStaticMarkup } from 'react-dom/server';

function makeDetail(overrides: Partial<RatingModelDetail> = {}): RatingModelDetail {
  return {
    id: 1,
    slug: 'mdv-aurora-09',
    brand: { id: 1, name: 'MDV', logo: '/logo.png' },
    series: 'Aurora',
    inner_unit: 'AURORA-09H',
    outer_unit: 'AURORA-09H-OUT',
    nominal_capacity: 2.6,
    total_index: 78.5,
    index_max: 100,
    publish_status: 'published',
    region_availability: [],
    price: '32000',
    pros_text: '',
    cons_text: '',
    youtube_url: '',
    rutube_url: '',
    vk_url: '',
    photos: [{ id: 1, image_url: 'https://hvac-info.com/media/x.jpg', alt: '' }],
    suppliers: [],
    parameter_scores: [],
    raw_values: [],
    methodology_version: 'v1',
    rank: 1,
    median_total_index: 55,
    editorial_lede: 'Лучший в среднем сегменте.',
    editorial_body: '',
    editorial_quote: '',
    editorial_quote_author: '',
    inner_unit_dimensions: '',
    inner_unit_weight_kg: null,
    outer_unit_dimensions: '',
    outer_unit_weight_kg: null,
    ...overrides,
  };
}

describe('ModelJsonLd', () => {
  it('строит корректный Schema.org Product JSON', () => {
    const data = buildJsonLd(makeDetail());

    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('Product');
    expect(data.name).toBe('MDV AURORA-09H');
    expect(data.sku).toBe('mdv-aurora-09');
    expect(data.url).toBe('https://hvac-info.com/rating-split-system/mdv-aurora-09/');
    expect(data.image).toBe('https://hvac-info.com/media/x.jpg');
    expect(data.description).toContain('Лучший в среднем сегменте');

    const brand = data.brand as { '@type': string; name: string };
    expect(brand['@type']).toBe('Brand');
    expect(brand.name).toBe('MDV');

    const offers = data.offers as { price: string; priceCurrency: string };
    expect(offers.price).toBe('32000');
    expect(offers.priceCurrency).toBe('RUB');

    const rating = data.aggregateRating as {
      ratingValue: string;
      bestRating: number;
      ratingCount: number;
    };
    expect(rating.ratingValue).toBe('78.5');
    expect(rating.bestRating).toBe(100);
    expect(rating.ratingCount).toBe(1);
  });

  it('опускает offers если нет цены, и image если нет фото', () => {
    const data = buildJsonLd(
      makeDetail({ price: null, photos: [], editorial_lede: '' }),
    );
    expect(data.offers).toBeUndefined();
    expect(data.image).toBeUndefined();
    expect(typeof data.description).toBe('string');
    expect(data.description).toContain('Кондиционер MDV AURORA-09H');
  });

  it('рендерит <script type="application/ld+json"> с валидным JSON', () => {
    const html = renderToStaticMarkup(<ModelJsonLd detail={makeDetail()} />);
    expect(html).toContain('<script type="application/ld+json">');
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*)<\/script>/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed['@type']).toBe('Product');
    expect(parsed.name).toBe('MDV AURORA-09H');
  });
});
