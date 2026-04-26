import { describe, expect, it } from 'vitest';
import { applyAdPositioning } from './ratingDisplay';

interface Item {
  id: number;
  name: string;
  score: number;
  is_ad: boolean;
  ad_position: number | null;
}

const mk = (
  id: number,
  name: string,
  score: number,
  is_ad = false,
  ad_position: number | null = null,
): Item => ({ id, name, score, is_ad, ad_position });

const opts = {
  getId: (i: Item) => i.id,
  getIsAd: (i: Item) => i.is_ad,
  getAdPosition: (i: Item) => i.ad_position,
  sortRegular: (xs: Item[]) => xs.slice().sort((a, b) => b.score - a.score),
};

describe('applyAdPositioning', () => {
  it('без рекламы — обычная сортировка с последовательным rank', () => {
    const items = [mk(1, 'A', 90), mk(2, 'B', 80), mk(3, 'C', 70)];
    const result = applyAdPositioning(items, opts);
    expect(result.map((r) => [r.name, r._displayRank])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 3],
    ]);
  });

  it('1 ad с position=3 → вставляется на 3-ю позицию, реклама не съедает rank', () => {
    const items = [
      mk(1, 'A', 90),
      mk(2, 'B', 80),
      mk(3, 'C', 70),
      mk(4, 'D', 60),
      mk(99, 'AD', 0, true, 3),
    ];
    const result = applyAdPositioning(items, opts);
    expect(result.map((r) => [r.name, r._displayRank])).toEqual([
      ['A', 1],
      ['B', 2],
      ['AD', null],
      ['C', 3],
      ['D', 4],
    ]);
  });

  it('ad-модель которая ещё и обычная — не дублируется', () => {
    const items = [
      mk(1, 'A', 90),
      mk(2, 'B', 80),
      mk(3, 'C', 70),
      // C сама по себе ad — должна показаться только на ad_position=2
      { ...mk(3, 'C', 70), is_ad: true, ad_position: 2 },
    ];
    const result = applyAdPositioning(items, opts);
    const names = result.map((r) => r.name);
    expect(names.filter((n) => n === 'C')).toHaveLength(1);
    expect(result.map((r) => [r.name, r._displayRank])).toEqual([
      ['A', 1],
      ['C', null],
      ['B', 2],
    ]);
  });

  it('ad с position > длины → в конец списка', () => {
    const items = [
      mk(1, 'A', 90),
      mk(2, 'B', 80),
      mk(99, 'AD', 0, true, 100),
    ];
    const result = applyAdPositioning(items, opts);
    expect(result.map((r) => [r.name, r._displayRank])).toEqual([
      ['A', 1],
      ['B', 2],
      ['AD', null],
    ]);
  });

  it('2 ad с разными position — оба вставлены на свои overall-позиции', () => {
    // ad_position — это overall row position (включая ad-строки),
    // а не rank среди обычных моделей.
    const items = [
      mk(1, 'A', 90),
      mk(2, 'B', 80),
      mk(3, 'C', 70),
      mk(4, 'D', 60),
      mk(98, 'AD1', 0, true, 1),
      mk(99, 'AD2', 0, true, 4),
    ];
    const result = applyAdPositioning(items, opts);
    expect(result.map((r) => [r.name, r._displayRank])).toEqual([
      ['AD1', null],
      ['A', 1],
      ['B', 2],
      ['AD2', null],
      ['C', 3],
      ['D', 4],
    ]);
  });

  it('ad без ad_position игнорируется как ad (попадает в обычный поток если is_ad=true но ad_position=null — не считается рекламой)', () => {
    const items = [
      mk(1, 'A', 90),
      mk(2, 'B', 80),
      // is_ad=true, но ad_position=null → должен фильтроваться из ad-набора
      { ...mk(99, 'X', 50), is_ad: true, ad_position: null },
    ];
    const result = applyAdPositioning(items, opts);
    expect(result.map((r) => [r.name, r._displayRank])).toEqual([
      ['A', 1],
      ['B', 2],
      ['X', 3],
    ]);
  });

  it('ad с position=1 — стоит первым, регулярный получает rank=1', () => {
    const items = [
      mk(1, 'A', 90),
      mk(2, 'B', 80),
      mk(99, 'AD', 0, true, 1),
    ];
    const result = applyAdPositioning(items, opts);
    expect(result.map((r) => [r.name, r._displayRank])).toEqual([
      ['AD', null],
      ['A', 1],
      ['B', 2],
    ]);
  });

  it('пустой список — пустой результат', () => {
    const result = applyAdPositioning<Item>([], opts);
    expect(result).toEqual([]);
  });
});
