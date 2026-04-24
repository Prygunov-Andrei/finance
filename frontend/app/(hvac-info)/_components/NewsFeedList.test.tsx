import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { HvacNews } from '@/lib/api/types/hvac';
import NewsFeedList from './NewsFeedList';

const searchParamsState: { value: string } = { value: '' };

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

beforeEach(() => {
  searchParamsState.value = '';
});

afterEach(() => {
  searchParamsState.value = '';
});

const mkItem = (id: number, partial: Partial<HvacNews> = {}): HvacNews => ({
  id,
  title: `Новость №${id}`,
  body: `<p>Тело новости ${id}, текст лида для проверки.</p>`,
  pub_date: '2026-04-21T10:00:00Z',
  category: 'industry',
  category_display: 'Индустрия',
  ...partial,
});

const items = [mkItem(1), mkItem(2), mkItem(3)];

describe('NewsFeedList — view modes', () => {
  it('default (нет ?view): рендерит grid с тремя колонками', () => {
    const { container } = render(
      <NewsFeedList items={items} hasMore={false} totalCount={items.length} />,
    );
    const grid = container.querySelector('[data-view="grid"]');
    expect(grid).toBeInTheDocument();
    expect(container.querySelector('[data-view="list"]')).toBeNull();
    expect(grid).toHaveStyle({ display: 'grid' });
  });

  it('?view=list: рендерит row-структуру (image и body — соседи в flex-row)', () => {
    searchParamsState.value = 'view=list';
    const itemsWithImg = items.map((it) =>
      mkItem(it.id, {
        media: [{ id: it.id, file: `http://example.com/p${it.id}.jpg`, media_type: 'image' }],
      } as Partial<HvacNews>),
    );
    const { container } = render(
      <NewsFeedList items={itemsWithImg} hasMore={false} totalCount={itemsWithImg.length} />,
    );
    const list = container.querySelector('[data-view="list"]');
    expect(list).toBeInTheDocument();
    expect(container.querySelector('[data-view="grid"]')).toBeNull();
    expect(list).toHaveStyle({ display: 'flex', flexDirection: 'column' });

    const rows = container.querySelectorAll('.rt-feed-row');
    expect(rows.length).toBe(itemsWithImg.length);
    const firstRow = rows[0] as HTMLElement;
    expect(firstRow).toHaveStyle({ display: 'flex', flexDirection: 'row' });

    const img = firstRow.querySelector('.rt-feed-row-img');
    const body = firstRow.querySelector('.rt-feed-row-body');
    expect(img).toBeInTheDocument();
    expect(body).toBeInTheDocument();
    expect(img?.parentElement).toBe(body?.parentElement);
  });

  it('?view=grid (явно): рендерит grid', () => {
    searchParamsState.value = 'view=grid';
    const { container } = render(
      <NewsFeedList items={items} hasMore={false} totalCount={items.length} />,
    );
    expect(container.querySelector('[data-view="grid"]')).toBeInTheDocument();
    expect(container.querySelector('[data-view="list"]')).toBeNull();
  });

  it('?view=list: показывает лид (3 строки) и заголовок каждой новости', () => {
    searchParamsState.value = 'view=list';
    render(<NewsFeedList items={items} hasMore={false} totalCount={items.length} />);
    expect(screen.getByText('Новость №1')).toBeInTheDocument();
    expect(screen.getByText('Новость №2')).toBeInTheDocument();
    expect(screen.getByText(/Тело новости 1/)).toBeInTheDocument();
  });

  it('фильтрация по category работает в обоих видах', () => {
    searchParamsState.value = 'view=list&category=business';
    const mixed = [mkItem(1, { category: 'business' }), mkItem(2, { category: 'industry' })];
    const { container } = render(
      <NewsFeedList items={mixed} hasMore={false} totalCount={mixed.length} />,
    );
    const rows = container.querySelectorAll('.rt-feed-row');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Новость №1');
  });

  it('skipFirst применяется в list-виде так же как в grid', () => {
    searchParamsState.value = 'view=list';
    const { container } = render(
      <NewsFeedList items={items} hasMore={false} totalCount={items.length} skipFirst={1} />,
    );
    const rows = container.querySelectorAll('.rt-feed-row');
    expect(rows.length).toBe(items.length - 1);
    expect(rows[0].textContent).toContain('Новость №2');
  });

  it('пустой visible после фильтрации: показывает empty-state в обоих видах', () => {
    searchParamsState.value = 'view=list&category=brands';
    render(<NewsFeedList items={items} hasMore={false} totalCount={items.length} />);
    expect(screen.getByText(/нет публикаций/i)).toBeInTheDocument();
  });
});

describe('NewsFeedList — grid card image aspect-ratio', () => {
  it('grid-карточка с image: рендерит .rt-feed-card-img c aspect-ratio 16/9 (без фикс. высоты)', () => {
    const withImage = mkItem(10, {
      media: [
        {
          id: 1,
          file: 'http://example.com/photo.jpg',
          media_type: 'image',
        },
      ],
      body: '<p>Текст без img.</p>',
    } as Partial<HvacNews>);
    const { container } = render(
      <NewsFeedList items={[withImage]} hasMore={false} totalCount={1} />,
    );
    const img = container.querySelector('.rt-feed-card-img') as HTMLElement | null;
    expect(img).toBeInTheDocument();
    expect(img!.style.aspectRatio).toBe('16 / 9');
    expect(img!.style.height).toBe('');
    expect(img!.style.background).toContain('http://example.com/photo.jpg');
    expect(img!.style.background).toMatch(/cover/);
  });
});

describe('NewsFeedList — text-only card (no image)', () => {
  it('grid-карточка без image: image-блок не рендерится, ссылка имеет data-no-image="true"', () => {
    const noImage = mkItem(20, { media: [], body: '<p>Только текст, нет img.</p>' });
    const { container } = render(
      <NewsFeedList items={[noImage]} hasMore={false} totalCount={1} />,
    );
    const card = container.querySelector('.rt-feed-card') as HTMLElement | null;
    expect(card).toBeInTheDocument();
    expect(card!.getAttribute('data-no-image')).toBe('true');
    expect(container.querySelector('.rt-feed-card-img')).toBeNull();
  });

  it('grid-карточка без image: title крупнее (serif, 19px) и виден лид', () => {
    const noImage = mkItem(21, {
      media: [],
      body: '<p>Длинный текст лида, который должен показываться в text-only карточке для заполнения пространства карточки и сохранения единой высоты ряда grid.</p>',
    });
    const { container } = render(
      <NewsFeedList items={[noImage]} hasMore={false} totalCount={1} />,
    );
    const title = container.querySelector('.rt-feed-card-title') as HTMLElement | null;
    expect(title).toBeInTheDocument();
    expect(title!.style.fontSize).toBe('19px');
    expect(title!.style.fontFamily).toContain('--rt-font-serif');

    const lede = container.querySelector('.rt-feed-card-lede') as HTMLElement | null;
    expect(lede).toBeInTheDocument();
    expect(lede!.textContent).toMatch(/Длинный текст лида/);
  });

  it('grid-карточка с image: title компактный (13px, sans), лид НЕ рендерится', () => {
    const withImage = mkItem(22, {
      media: [{ id: 1, file: 'http://example.com/p.jpg', media_type: 'image' }],
    } as Partial<HvacNews>);
    const { container } = render(
      <NewsFeedList items={[withImage]} hasMore={false} totalCount={1} />,
    );
    const title = container.querySelector('.rt-feed-card-title') as HTMLElement | null;
    expect(title).toBeInTheDocument();
    expect(title!.style.fontSize).toBe('13px');
    expect(container.querySelector('.rt-feed-card-lede')).toBeNull();
  });

  it('grid-card flex column + body flex:1 — для одинаковой высоты ряда', () => {
    const noImage = mkItem(23, { media: [], body: '<p>Текст.</p>' });
    const { container } = render(
      <NewsFeedList items={[noImage]} hasMore={false} totalCount={1} />,
    );
    const card = container.querySelector('.rt-feed-card') as HTMLElement;
    expect(card.style.display).toBe('flex');
    expect(card.style.flexDirection).toBe('column');
    expect(card.style.height).toBe('100%');
    const body = container.querySelector('.rt-feed-card-body') as HTMLElement;
    expect(body.style.flex).toMatch(/^1\b/);
  });
});

describe('NewsFeedList — list-mode text-only row (no image)', () => {
  it('list-row с image: рендерит .rt-feed-row-img, data-no-image отсутствует', () => {
    searchParamsState.value = 'view=list';
    const withImage = mkItem(30, {
      media: [{ id: 1, file: 'http://example.com/p.jpg', media_type: 'image' }],
    } as Partial<HvacNews>);
    const { container } = render(
      <NewsFeedList items={[withImage]} hasMore={false} totalCount={1} />,
    );
    const row = container.querySelector('.rt-feed-row') as HTMLElement | null;
    expect(row).toBeInTheDocument();
    expect(row!.getAttribute('data-no-image')).toBeNull();
    expect(container.querySelector('.rt-feed-row-img')).toBeInTheDocument();
  });

  it('list-row без image: image-блок не рендерится, ссылка имеет data-no-image="true"', () => {
    searchParamsState.value = 'view=list';
    const noImage = mkItem(31, { media: [], body: '<p>Только текст, нет img.</p>' });
    const { container } = render(
      <NewsFeedList items={[noImage]} hasMore={false} totalCount={1} />,
    );
    const row = container.querySelector('.rt-feed-row') as HTMLElement | null;
    expect(row).toBeInTheDocument();
    expect(row!.getAttribute('data-no-image')).toBe('true');
    expect(container.querySelector('.rt-feed-row-img')).toBeNull();
  });

  it('list-row без image: title имеет className rt-feed-row-title и крупнее (serif, 19px)', () => {
    searchParamsState.value = 'view=list';
    const noImage = mkItem(32, {
      media: [],
      body: '<p>Текст лида для text-only строки в режиме списка.</p>',
    });
    const { container } = render(
      <NewsFeedList items={[noImage]} hasMore={false} totalCount={1} />,
    );
    const title = container.querySelector('.rt-feed-row-title') as HTMLElement | null;
    expect(title).toBeInTheDocument();
    expect(title!.style.fontSize).toBe('19px');
    expect(title!.style.fontFamily).toContain('--rt-font-serif');
    expect(title!.textContent).toBe('Новость №32');
  });

  it('list-row с image: title меньшего размера (16px serif), className тот же', () => {
    searchParamsState.value = 'view=list';
    const withImage = mkItem(33, {
      media: [{ id: 1, file: 'http://example.com/p.jpg', media_type: 'image' }],
    } as Partial<HvacNews>);
    const { container } = render(
      <NewsFeedList items={[withImage]} hasMore={false} totalCount={1} />,
    );
    const title = container.querySelector('.rt-feed-row-title') as HTMLElement | null;
    expect(title).toBeInTheDocument();
    expect(title!.style.fontSize).toBe('16px');
  });

  it('list-row без image: body занимает всю ширину (flex:1), лид виден', () => {
    searchParamsState.value = 'view=list';
    const noImage = mkItem(34, {
      media: [],
      body: '<p>Достаточно длинный текст лида, который должен отображаться в text-only строке режима списка для занятия пространства.</p>',
    });
    const { container } = render(
      <NewsFeedList items={[noImage]} hasMore={false} totalCount={1} />,
    );
    const body = container.querySelector('.rt-feed-row-body') as HTMLElement;
    expect(body.style.flex).toMatch(/^1\b/);
    const lede = container.querySelector('.rt-feed-row-lede') as HTMLElement | null;
    expect(lede).toBeInTheDocument();
    expect(lede!.textContent).toMatch(/Достаточно длинный текст лида/);
  });
});
