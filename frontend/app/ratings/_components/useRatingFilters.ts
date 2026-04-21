'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { RatingModelListItem } from '@/lib/api/types/rating';

export type CapacityBucket = 'any' | 'lt3' | '3to4' | 'gt4';

export interface RatingFilters {
  brands: string[];
  regions: string[];
  capacity: CapacityBucket;
  priceMin: number | null;
  priceMax: number | null;
}

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseNum(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseCapacity(raw: string | null): CapacityBucket {
  if (raw === 'lt3' || raw === '3to4' || raw === 'gt4') return raw;
  return 'any';
}

export function getFiltersFromParams(sp: URLSearchParams): RatingFilters {
  return {
    brands: parseList(sp.get('brand')),
    regions: parseList(sp.get('region')),
    capacity: parseCapacity(sp.get('capacity')),
    priceMin: parseNum(sp.get('price_min')),
    priceMax: parseNum(sp.get('price_max')),
  };
}

function capacityMatches(cap: number | null, bucket: CapacityBucket): boolean {
  if (bucket === 'any') return true;
  if (cap == null) return false;
  if (bucket === 'lt3') return cap < 3;
  if (bucket === '3to4') return cap >= 3 && cap <= 4;
  return cap > 4;
}

export function applyFilters(
  models: RatingModelListItem[],
  f: RatingFilters
): RatingModelListItem[] {
  return models.filter((m) => {
    if (f.brands.length && !f.brands.includes(m.brand)) return false;
    if (f.regions.length) {
      const mRegions = m.region_availability.map((r) => r.region_code);
      if (!f.regions.some((r) => mRegions.includes(r))) return false;
    }
    if (!capacityMatches(m.nominal_capacity, f.capacity)) return false;
    const p = m.price == null ? null : Number(m.price);
    if (f.priceMin != null && (p == null || p < f.priceMin)) return false;
    if (f.priceMax != null && (p == null || p > f.priceMax)) return false;
    return true;
  });
}

export interface RatingFacets {
  brands: string[];
  regions: Array<{ code: string; label: string }>;
  priceMin: number | null;
  priceMax: number | null;
}

export function getFacets(models: RatingModelListItem[]): RatingFacets {
  const brandSet = new Set<string>();
  const regionMap = new Map<string, string>();
  let pmin: number | null = null;
  let pmax: number | null = null;
  for (const m of models) {
    if (m.brand) brandSet.add(m.brand);
    for (const r of m.region_availability) {
      if (!regionMap.has(r.region_code)) regionMap.set(r.region_code, r.region_display);
    }
    if (m.price != null) {
      const n = Number(m.price);
      if (Number.isFinite(n)) {
        if (pmin == null || n < pmin) pmin = n;
        if (pmax == null || n > pmax) pmax = n;
      }
    }
  }
  return {
    brands: Array.from(brandSet).sort((a, b) => a.localeCompare(b, 'ru')),
    regions: Array.from(regionMap.entries())
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru')),
    priceMin: pmin,
    priceMax: pmax,
  };
}

export function useRatingFilters(models: RatingModelListItem[]) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const filters = useMemo(() => getFiltersFromParams(new URLSearchParams(sp.toString())), [sp]);
  const facets = useMemo(() => getFacets(models), [models]);
  const filtered = useMemo(() => applyFilters(models, filters), [models, filters]);

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, sp, router]
  );

  const setBrands = useCallback((xs: string[]) => updateParam('brand', xs.length ? xs.join(',') : null), [updateParam]);
  const setRegions = useCallback((xs: string[]) => updateParam('region', xs.length ? xs.join(',') : null), [updateParam]);
  const setCapacity = useCallback((c: CapacityBucket) => updateParam('capacity', c === 'any' ? null : c), [updateParam]);
  const setPriceMin = useCallback((n: number | null) => updateParam('price_min', n == null ? null : String(n)), [updateParam]);
  const setPriceMax = useCallback((n: number | null) => updateParam('price_max', n == null ? null : String(n)), [updateParam]);
  const resetAll = useCallback(() => {
    const next = new URLSearchParams(sp.toString());
    ['brand', 'region', 'capacity', 'price_min', 'price_max'].forEach((k) => next.delete(k));
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, sp, router]);

  return {
    filters,
    facets,
    filtered,
    setBrands,
    setRegions,
    setCapacity,
    setPriceMin,
    setPriceMax,
    resetAll,
  };
}
