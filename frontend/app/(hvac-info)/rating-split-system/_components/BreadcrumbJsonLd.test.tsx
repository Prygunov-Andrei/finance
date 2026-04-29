import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BreadcrumbJsonLd, { buildBreadcrumbJsonLd } from './BreadcrumbJsonLd';

describe('BreadcrumbJsonLd', () => {
  it('строит BreadcrumbList с position 1..N', () => {
    const data = buildBreadcrumbJsonLd([
      { name: 'Главная', url: 'https://hvac-info.com/' },
      { name: 'Рейтинг', url: 'https://hvac-info.com/rating-split-system' },
      { name: 'MDV AURORA-09H' },
    ]);
    expect(data['@type']).toBe('BreadcrumbList');
    expect(data.itemListElement).toHaveLength(3);
    expect(data.itemListElement[0].position).toBe(1);
    expect(data.itemListElement[0].item).toBe('https://hvac-info.com/');
    expect(data.itemListElement[2].position).toBe(3);
    expect(data.itemListElement[2].name).toBe('MDV AURORA-09H');
    expect(data.itemListElement[2]).not.toHaveProperty('item');
  });

  it('возвращает null если crumbs пустой', () => {
    const html = renderToStaticMarkup(<BreadcrumbJsonLd crumbs={[]} />);
    expect(html).toBe('');
  });

  it('рендерит <script type="application/ld+json">', () => {
    const html = renderToStaticMarkup(
      <BreadcrumbJsonLd crumbs={[{ name: 'X', url: 'https://x.com/' }, { name: 'Y' }]} />,
    );
    expect(html).toContain('<script type="application/ld+json">');
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*)<\/script>/);
    const parsed = JSON.parse(match![1]);
    expect(parsed['@type']).toBe('BreadcrumbList');
  });
});
