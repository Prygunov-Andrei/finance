import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { HvacNews } from '@/lib/api/types/hvac';
import NewsFeedHero from './NewsFeedHero';

const mkItem = (id: number, partial: Partial<HvacNews> = {}): HvacNews => ({
  id,
  title: `Новость №${id}`,
  body: `<p>Тело новости ${id}, текст лида для проверки.</p>`,
  pub_date: '2026-04-21T10:00:00Z',
  category: 'industry',
  category_display: 'Индустрия',
  ...partial,
});

describe('NewsFeedHero', () => {
  it('возвращает null для пустого списка', () => {
    const { container } = render(<NewsFeedHero items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hero с image: рендерит .rt-feed-hero-img c aspect-ratio 16/9 + next/image priority', () => {
    const heroItem = mkItem(1, {
      media: [{ id: 1, file: 'http://example.com/hero.jpg', media_type: 'image' }],
    } as Partial<HvacNews>);
    const { container } = render(<NewsFeedHero items={[heroItem]} />);
    const img = container.querySelector('.rt-feed-hero-img') as HTMLElement | null;
    expect(img).toBeInTheDocument();
    expect(img!.style.aspectRatio).toBe('16 / 9');
    expect(img!.style.height).toBe('');
    // Polish 2.0 A1: было background-url, стало next/image fill priority.
    // URL передаётся в src дочернего <img>; next/image для абсолютных URL
    // рендерит как unoptimized (тот же src без /_next/image оптимизации).
    const innerImg = img!.querySelector('img') as HTMLImageElement | null;
    expect(innerImg).not.toBeNull();
    expect(innerImg!.getAttribute('src')).toContain('http://example.com/hero.jpg');
  });

  it('hero без image: image-блок не рендерится, ссылка имеет data-no-image="true"', () => {
    const noImage = mkItem(2, { media: [], body: '<p>Только текст.</p>' });
    const { container } = render(<NewsFeedHero items={[noImage]} />);
    const link = container.querySelector('.rt-feed-hero-link') as HTMLElement | null;
    expect(link).toBeInTheDocument();
    expect(link!.getAttribute('data-no-image')).toBe('true');
    expect(container.querySelector('.rt-feed-hero-img')).toBeNull();
  });

  it('hero без image: title крупнее (34px вместо 26px)', () => {
    const noImage = mkItem(3, { media: [], body: '<p>Текст.</p>' });
    const { container } = render(<NewsFeedHero items={[noImage]} />);
    const h2 = container.querySelector('.rt-feed-hero-h2') as HTMLElement | null;
    expect(h2).toBeInTheDocument();
    expect(h2!.style.fontSize).toBe('34px');
  });

  it('hero с image: title 26px (исходный размер)', () => {
    const withImage = mkItem(4, {
      media: [{ id: 1, file: 'http://example.com/p.jpg', media_type: 'image' }],
    } as Partial<HvacNews>);
    const { container } = render(<NewsFeedHero items={[withImage]} />);
    const h2 = container.querySelector('.rt-feed-hero-h2') as HTMLElement | null;
    expect(h2!.style.fontSize).toBe('26px');
  });
});
