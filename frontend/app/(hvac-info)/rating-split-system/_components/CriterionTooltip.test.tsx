import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import CriterionTooltip from './CriterionTooltip';

describe('CriterionTooltip', () => {
  it('пустое description → disabled-значок без button, без tooltip', () => {
    const { container } = render(<CriterionTooltip description="" />);
    expect(
      container.querySelector('button[aria-label="Описание критерия"]'),
    ).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
    // Остаётся visual-значок «?» (span, aria-hidden).
    expect(container.textContent).toContain('?');
  });

  it('непустое description → клик по «?» открывает tooltip', () => {
    const { container } = render(
      <CriterionTooltip description="Полное описание критерия" />,
    );
    const btn = container.querySelector(
      'button[aria-label="Описание критерия"]',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    // title-атрибут — fallback для keyboard + SR.
    expect(btn.getAttribute('title')).toBe('Полное описание критерия');
    // По-умолчанию tooltip скрыт.
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByRole('tooltip').textContent).toBe(
      'Полное описание критерия',
    );
  });

  it('второй клик — закрывает tooltip (toggle)', () => {
    const { container } = render(
      <CriterionTooltip description="Описание" />,
    );
    const btn = container.querySelector(
      'button[aria-label="Описание критерия"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('Escape — закрывает tooltip', () => {
    const { container } = render(
      <CriterionTooltip description="Описание" />,
    );
    const btn = container.querySelector(
      'button[aria-label="Описание критерия"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(btn, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hover мышью — открывает tooltip, mouseleave — закрывает', () => {
    const { container } = render(
      <CriterionTooltip description="Описание" />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('description из одних пробелов трактуется как пустое (disabled)', () => {
    const { container } = render(<CriterionTooltip description="   " />);
    expect(
      container.querySelector('button[aria-label="Описание критерия"]'),
    ).toBeNull();
  });
});
