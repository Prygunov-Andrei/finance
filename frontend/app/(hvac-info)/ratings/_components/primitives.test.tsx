import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrandLogo } from './primitives';

describe('BrandLogo', () => {
  it('без src рендерит текстовый плейсхолдер с первой буквой бренда', () => {
    render(<BrandLogo src="" name="Haier" />);
    const placeholder = screen.getByLabelText('Haier');
    expect(placeholder).toBeInTheDocument();
    expect(placeholder.textContent).toBe('H');
    // Нет ни одного <img> — только плейсхолдер
    expect(document.querySelectorAll('img').length).toBe(0);
  });

  it('без src и без name — рендерит fallback-точку', () => {
    render(<BrandLogo src="" name="" />);
    const placeholder = screen.getByLabelText('');
    expect(placeholder.textContent).toBe('·');
  });

  it('когда srcDark не передан — рендерит один <img> с классом rt-brand-logo-single', () => {
    render(<BrandLogo src="/media/brands/haier.png" name="Haier" />);
    const imgs = document.querySelectorAll('img');
    expect(imgs.length).toBe(1);
    const img = imgs[0] as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/media/brands/haier.png');
    expect(img.className).toBe('rt-brand-logo-single');
    expect(img.getAttribute('alt')).toBe('Haier');
    // Класс -single сигнал для CSS-фоллбека: `filter: invert(1)` в .dark.
    expect(img.className).not.toContain('rt-brand-logo-light');
  });

  it('когда srcDark=null — рендерит один <img> с rt-brand-logo-single (как при undefined)', () => {
    render(<BrandLogo src="/media/brands/haier.png" srcDark={null} name="Haier" />);
    const imgs = document.querySelectorAll('img');
    expect(imgs.length).toBe(1);
    expect(imgs[0].className).toBe('rt-brand-logo-single');
  });

  it('когда srcDark пустая строка — рендерит один <img> с rt-brand-logo-single', () => {
    render(<BrandLogo src="/media/brands/haier.png" srcDark="" name="Haier" />);
    const imgs = document.querySelectorAll('img');
    expect(imgs.length).toBe(1);
    expect(imgs[0].className).toBe('rt-brand-logo-single');
  });

  it('когда srcDark передан — рендерит два <img>: -light (видимый) + -dark (скрытый)', () => {
    render(
      <BrandLogo
        src="/media/brands/casarte.png"
        srcDark="/media/brands/dark/casarte.png"
        name="Casarte"
      />,
    );
    const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
    expect(imgs).toHaveLength(2);

    const lightImg = imgs.find((el) => el.classList.contains('rt-brand-logo-light'));
    const darkImg = imgs.find((el) => el.classList.contains('rt-brand-logo-dark'));
    expect(lightImg).toBeTruthy();
    expect(darkImg).toBeTruthy();
    expect(lightImg!.getAttribute('src')).toBe('/media/brands/casarte.png');
    expect(darkImg!.getAttribute('src')).toBe('/media/brands/dark/casarte.png');
    // Inline defaults: light visible, dark скрыт до применения .dark CSS.
    expect(lightImg!.style.display).toBe('block');
    expect(darkImg!.style.display).toBe('none');
    // Dark-версия не читается скринридерами (aria-hidden),
    // чтобы название бренда не дублировалось.
    expect(darkImg!.getAttribute('aria-hidden')).toBe('true');
    expect(darkImg!.getAttribute('alt')).toBe('Casarte');
  });

  it('оба <img> имеют одинаковые size-constraints', () => {
    render(
      <BrandLogo
        src="/l.png"
        srcDark="/d.png"
        name="X"
        size={32}
      />,
    );
    const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
    expect(imgs).toHaveLength(2);
    for (const img of imgs) {
      expect(img.style.maxHeight).toBe('32px');
      expect(img.style.objectFit).toBe('contain');
    }
  });

  it('size=28 применяется к maxHeight', () => {
    render(<BrandLogo src="/l.png" name="X" size={28} />);
    const img = document.querySelector('img') as HTMLImageElement;
    expect(img.style.maxHeight).toBe('28px');
  });

  it('light <img> не получает aria-hidden (он основной, читается скринридером)', () => {
    render(<BrandLogo src="/l.png" srcDark="/d.png" name="Haier" />);
    const lightImg = document.querySelector('img.rt-brand-logo-light');
    expect(lightImg).toBeTruthy();
    // В отличие от dark-версии, light-img должен быть видим screenreader'у,
    // чтобы `alt="Haier"` был доступен (рендерится в light-теме по умолчанию).
    expect(lightImg!.getAttribute('aria-hidden')).toBeNull();
  });

  it('single-variant <img> без aria-hidden (screenreader должен видеть alt)', () => {
    render(<BrandLogo src="/l.png" name="Haier" />);
    const img = document.querySelector('img.rt-brand-logo-single');
    expect(img).toBeTruthy();
    expect(img!.getAttribute('aria-hidden')).toBeNull();
    expect(img!.getAttribute('alt')).toBe('Haier');
  });
});
