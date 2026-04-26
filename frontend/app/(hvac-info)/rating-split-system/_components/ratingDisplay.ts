export type WithDisplayRank<T> = T & { _displayRank: number | null };

export interface AdPositioningOptions<T> {
  getId: (item: T) => number;
  getIsAd: (item: T) => boolean;
  getAdPosition: (item: T) => number | null;
  sortRegular: (regular: T[]) => T[];
}

export function applyAdPositioning<T>(
  items: T[],
  opts: AdPositioningOptions<T>,
): WithDisplayRank<T>[] {
  const { getId, getIsAd, getAdPosition, sortRegular } = opts;

  const ads = items.filter(
    (item) => getIsAd(item) && getAdPosition(item) != null,
  );
  const adIds = new Set(ads.map(getId));

  const regular = items.filter((item) => !adIds.has(getId(item)));
  const sortedRegular = sortRegular(regular);

  const adsRemaining = ads
    .slice()
    .sort((a, b) => (getAdPosition(a) ?? 0) - (getAdPosition(b) ?? 0));

  const result: WithDisplayRank<T>[] = [];
  let rankCounter = 1;

  for (let i = 0; i < sortedRegular.length; i++) {
    while (true) {
      const targetPosition = result.length + 1;
      const idx = adsRemaining.findIndex(
        (a) => getAdPosition(a) === targetPosition,
      );
      if (idx === -1) break;
      const ad = adsRemaining[idx];
      result.push(
        Object.assign({}, ad, { _displayRank: null }) as WithDisplayRank<T>,
      );
      adsRemaining.splice(idx, 1);
    }
    result.push(
      Object.assign({}, sortedRegular[i], {
        _displayRank: rankCounter,
      }) as WithDisplayRank<T>,
    );
    rankCounter += 1;
  }

  for (const ad of adsRemaining) {
    result.push(
      Object.assign({}, ad, { _displayRank: null }) as WithDisplayRank<T>,
    );
  }

  return result;
}

/* CSS-классы для рекламной строки. Стили объявлены в tokens.css с
 * dark-вариантом, чтобы амбер-фон не «горел» белым пятном на тёмной теме. */
export const AD_ROW_CLASS = 'rt-ad-row';
export const AD_BADGE_CLASS = 'rt-ad-badge';

/** @deprecated Используй AD_ROW_CLASS / AD_BADGE_CLASS — они учитывают dark-тему. */
export const AD_ROW_BACKGROUND = 'hsl(40 100% 96% / 1)';
/** @deprecated См. AD_BADGE_CLASS. */
export const AD_BADGE_BACKGROUND = 'hsl(40 90% 55% / 0.2)';
