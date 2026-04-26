import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { RatingModelListItem } from '@/lib/api/types/rating';

import ArchiveTable from './ArchiveTable';

function mkModel(
  id: number,
  brand: string,
  inner_unit: string,
  total_index: number,
): RatingModelListItem {
  return {
    id,
    slug: `m-${id}`,
    brand,
    brand_logo: '',
    inner_unit,
    series: '',
    nominal_capacity: null,
    total_index,
    index_max: 100,
    publish_status: 'archived',
    region_availability: [],
    price: null,
    noise_score: null,
    has_noise_measurement: false,
    scores: {},
    is_ad: false,
    ad_position: null,
    rank: null,
  };
}

describe('ArchiveTable', () => {
  it('пустой архив → empty state', () => {
    render(<ArchiveTable models={[]} />);
    expect(screen.getByTestId('archive-empty')).toBeInTheDocument();
  });

  it('сортирует по total_index убыванием', () => {
    const models = [
      mkModel(1, 'A', 'aaa', 50),
      mkModel(2, 'B', 'bbb', 80),
      mkModel(3, 'C', 'ccc', 65),
    ];
    render(<ArchiveTable models={models} />);
    const rows = screen.getAllByTestId('archive-row');
    expect(rows).toHaveLength(3);
    const firstHref = rows[0].getAttribute('href');
    const lastHref = rows[2].getAttribute('href');
    expect(firstHref).toContain('m-2');
    expect(lastHref).toContain('m-1');
  });
});
