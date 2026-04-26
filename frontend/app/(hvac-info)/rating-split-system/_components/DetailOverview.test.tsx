import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RatingModelDetail } from '@/lib/api/types/rating';
import DetailOverview from './DetailOverview';

const baseDetail: RatingModelDetail = {
  id: 1,
  slug: 'test',
  brand: { id: 1, name: 'Casarte', logo: '' },
  series: '',
  inner_unit: 'CAS-25',
  outer_unit: '',
  nominal_capacity: null,
  total_index: 78,
  index_max: 100,
  publish_status: 'published',
  region_availability: [],
  price: null,
  pros_text: 'Тихий — минимальный шум\nСтильный дизайн',
  cons_text: 'Дорогая установка',
  youtube_url: '',
  rutube_url: '',
  vk_url: '',
  photos: [],
  suppliers: [],
  parameter_scores: [],
  raw_values: [],
  methodology_version: '2026.04',
  rank: 1,
  median_total_index: 70,
  editorial_lede: '',
  editorial_body: 'Первый параграф обзора.\n\nВторой параграф обзора.',
  editorial_quote: '',
  editorial_quote_author: '',
  inner_unit_dimensions: '',
  inner_unit_weight_kg: null,
  outer_unit_dimensions: '',
  outer_unit_weight_kg: null,
};

describe('DetailOverview (Polish-4)', () => {
  it('НЕ рендерит блок Плюсы/Минусы (теперь в DetailEditorial)', () => {
    render(<DetailOverview detail={baseDetail} />);
    // В DetailOverview нет ни «Плюсы · N», ни «Минусы · N».
    expect(screen.queryByText(/плюсы · \d/i)).toBeNull();
    expect(screen.queryByText(/минусы · \d/i)).toBeNull();
  });

  it('рендерит editorial_body как параграфы', () => {
    render(<DetailOverview detail={baseDetail} />);
    expect(screen.getByText('Первый параграф обзора.')).toBeTruthy();
    expect(screen.getByText('Второй параграф обзора.')).toBeTruthy();
  });

  it('placeholder если editorial_body пустой', () => {
    render(
      <DetailOverview
        detail={{ ...baseDetail, editorial_body: '' }}
      />,
    );
    expect(screen.getByText(/готовится/i)).toBeTruthy();
  });
});
