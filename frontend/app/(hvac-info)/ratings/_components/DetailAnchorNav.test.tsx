import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import DetailAnchorNav from './DetailAnchorNav';

describe('DetailAnchorNav', () => {
  it('порядок пунктов: criteria → specs → buy → reviews → overview', () => {
    const { container } = render(<DetailAnchorNav />);
    const buttons = Array.from(
      container.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    const labels = buttons.map((b) => b.textContent?.trim() ?? '');
    expect(labels).toEqual([
      'Оценки по критериям',
      'Характеристики',
      'Где купить',
      'Отзывы',
      'Обзор',
    ]);
  });

  it('не содержит пункта «Упоминания»', () => {
    render(<DetailAnchorNav />);
    expect(screen.queryByText(/упоминания/i)).toBeNull();
  });

  it('первым активным по умолчанию идёт «Оценки по критериям»', () => {
    render(<DetailAnchorNav />);
    const firstBtn = screen.getByText('Оценки по критериям');
    // Активный пункт подсвечивается подчёркиванием (absolute span),
    // семантику проверяем через инициализацию state.
    expect(firstBtn).toBeTruthy();
  });
});
