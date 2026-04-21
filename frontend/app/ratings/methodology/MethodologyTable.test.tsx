import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { RatingMethodologyCriterion } from '@/lib/api/types/rating';

import MethodologyTable, { typeOf } from './MethodologyTable';

function mkCriterion(
  over: Partial<RatingMethodologyCriterion> = {},
): RatingMethodologyCriterion {
  return {
    code: 'c1',
    name_ru: 'Критерий 1',
    description_ru: 'описание',
    weight: 10,
    unit: '',
    value_type: 'numeric',
    scoring_type: 'min_median_max',
    group: 'climate',
    group_display: 'Климат',
    display_order: 1,
    min_value: 0,
    median_value: 5,
    max_value: 10,
    ...over,
  };
}

describe('typeOf', () => {
  it('value_type=binary → bin', () => {
    expect(typeOf(mkCriterion({ value_type: 'binary' }))).toBe('bin');
  });
  it('scoring_type=binary → bin даже если value_type numeric', () => {
    expect(
      typeOf(mkCriterion({ value_type: 'numeric', scoring_type: 'binary' })),
    ).toBe('bin');
  });
  it('value_type=categorical → cat', () => {
    expect(typeOf(mkCriterion({ value_type: 'categorical' }))).toBe('cat');
  });
  it('value_type=fallback → fallback', () => {
    expect(typeOf(mkCriterion({ value_type: 'fallback' }))).toBe('fallback');
  });
  it('value_type=brand_age → age', () => {
    expect(typeOf(mkCriterion({ value_type: 'brand_age' }))).toBe('age');
  });
  it('default numeric → num', () => {
    expect(typeOf(mkCriterion({ value_type: 'numeric' }))).toBe('num');
  });
});

describe('MethodologyTable', () => {
  it('пустой массив критериев показывает empty state', () => {
    render(<MethodologyTable criteria={[]} />);
    expect(screen.getByTestId('methodology-empty')).toBeInTheDocument();
  });

  it('сортирует критерии по весу убыванием и открывает первые 3', () => {
    const criteria = [
      mkCriterion({ code: 'a', weight: 2 }),
      mkCriterion({ code: 'b', weight: 10 }),
      mkCriterion({ code: 'c', weight: 5 }),
      mkCriterion({ code: 'd', weight: 1 }),
    ];
    render(<MethodologyTable criteria={criteria} />);
    expect(
      screen.getByTestId('methodology-row-b').getAttribute('aria-expanded'),
    ).toBe('true');
    expect(
      screen.getByTestId('methodology-row-c').getAttribute('aria-expanded'),
    ).toBe('true');
    expect(
      screen.getByTestId('methodology-row-a').getAttribute('aria-expanded'),
    ).toBe('true');
    expect(
      screen.getByTestId('methodology-row-d').getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('клик по строке переключает expand/collapse', () => {
    const criteria = [
      mkCriterion({ code: 'a', weight: 1 }),
      mkCriterion({ code: 'b', weight: 2 }),
      mkCriterion({ code: 'c', weight: 3 }),
      mkCriterion({ code: 'd', weight: 4 }),
    ];
    render(<MethodologyTable criteria={criteria} />);
    const row = screen.getByTestId('methodology-row-a');
    expect(row.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('false');
  });
});
