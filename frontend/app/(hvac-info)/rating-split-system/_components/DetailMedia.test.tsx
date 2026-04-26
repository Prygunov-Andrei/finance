import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RatingModelDetail } from '@/lib/api/types/rating';
import DetailMedia from './DetailMedia';

const baseDetail = (over: Partial<RatingModelDetail> = {}): RatingModelDetail => ({
  id: 1,
  slug: 'test',
  brand: { id: 1, name: 'Test', logo: '' },
  series: '',
  inner_unit: 'T-1',
  outer_unit: '',
  nominal_capacity: null,
  total_index: 80,
  index_max: 100,
  publish_status: 'published',
  region_availability: [],
  price: null,
  pros_text: '',
  cons_text: '',
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
  editorial_body: '',
  editorial_quote: '',
  editorial_quote_author: '',
  inner_unit_dimensions: '',
  inner_unit_weight_kg: null,
  outer_unit_dimensions: '',
  outer_unit_weight_kg: null,
  ...over,
});

describe('DetailMedia — переключатель видеоплатформ', () => {
  it('одна платформа: переключатель не рендерится', () => {
    const detail = baseDetail({
      youtube_url: 'https://www.youtube.com/watch?v=abcdEFGH123',
    });
    const { container } = render(<DetailMedia detail={detail} />);
    expect(container.querySelector('[role="tablist"][aria-label="Платформа видео"]')).toBeNull();
    expect(screen.queryByText(/Смотреть на:/i)).toBeNull();
  });

  it('две платформы: показывается tablist с двумя tab', () => {
    const detail = baseDetail({
      youtube_url: 'https://www.youtube.com/watch?v=abcdEFGH123',
      rutube_url: 'https://rutube.ru/video/0123456789abcdef0123456789abcdef/',
    });
    const { container } = render(<DetailMedia detail={detail} />);
    const tablist = container.querySelector('[role="tablist"][aria-label="Платформа видео"]');
    expect(tablist).toBeTruthy();
    const tabs = tablist!.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(2);
    expect(screen.getByText('YouTube')).toBeTruthy();
    expect(screen.getByText('RUTUBE')).toBeTruthy();
  });

  it('три платформы: youtube активна по умолчанию, клик на VK переключает iframe', () => {
    const detail = baseDetail({
      youtube_url: 'https://www.youtube.com/watch?v=abcdEFGH123',
      rutube_url: 'https://rutube.ru/video/0123456789abcdef0123456789abcdef/',
      vk_url: 'https://vk.com/video-12345_67890',
    });
    const { container } = render(<DetailMedia detail={detail} />);
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe!.getAttribute('src')).toContain('youtube.com/embed/');

    const ytTab = container.querySelector('[role="tab"][data-platform="youtube"]');
    expect(ytTab!.getAttribute('aria-selected')).toBe('true');

    const vkTab = container.querySelector('[role="tab"][data-platform="vk"]') as HTMLButtonElement;
    expect(vkTab).toBeTruthy();
    fireEvent.click(vkTab);

    const iframeAfter = container.querySelector('iframe');
    expect(iframeAfter!.getAttribute('src')).toContain('vk.com/video_ext.php');
    expect(vkTab.getAttribute('aria-selected')).toBe('true');
    expect(ytTab!.getAttribute('aria-selected')).toBe('false');
  });

  it('подпись «открыть на платформе» больше не рендерится', () => {
    const detail = baseDetail({
      youtube_url: 'https://www.youtube.com/watch?v=abcdEFGH123',
      rutube_url: 'https://rutube.ru/video/0123456789abcdef0123456789abcdef/',
    });
    render(<DetailMedia detail={detail} />);
    expect(screen.queryByText(/открыть на платформе/i)).toBeNull();
    expect(screen.queryByText(/Смотреть на платформах/i)).toBeNull();
  });

  it('видеоплейсхолдер показывается, если ни одной платформы нет', () => {
    const detail = baseDetail();
    render(<DetailMedia detail={detail} />);
    expect(screen.getByText(/видеообзор скоро/i)).toBeTruthy();
  });
});

describe('DetailMedia — фото-лупа (4.3)', () => {
  const withPhoto = (over: Partial<RatingModelDetail> = {}): RatingModelDetail =>
    baseDetail({
      photos: [
        { id: 1, image_url: 'https://example.com/photo-1.jpg', alt: 'Фото 1' },
      ],
      ...over,
    });

  it('фото есть → рендерится photo-zoom trigger', () => {
    render(<DetailMedia detail={withPhoto()} />);
    const trigger = screen.getByTestId('photo-zoom');
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('aria-label')).toBe('Увеличить фото');
  });

  it('photo-modal появляется только после клика по trigger', () => {
    render(<DetailMedia detail={withPhoto()} />);
    expect(screen.queryByTestId('photo-modal')).toBeNull();
    fireEvent.click(screen.getByTestId('photo-zoom'));
    const modal = screen.getByTestId('photo-modal');
    expect(modal.getAttribute('role')).toBe('dialog');
    // Внутри modal — фото с тем же src.
    const img = modal.querySelector('img');
    expect(img!.getAttribute('src')).toBe('https://example.com/photo-1.jpg');
  });

  it('клик по close-кнопке закрывает modal', () => {
    render(<DetailMedia detail={withPhoto()} />);
    fireEvent.click(screen.getByTestId('photo-zoom'));
    expect(screen.queryByTestId('photo-modal')).toBeTruthy();
    fireEvent.click(screen.getByTestId('photo-modal-close'));
    expect(screen.queryByTestId('photo-modal')).toBeNull();
  });

  it('фото нет → нет photo-zoom trigger (placeholder вместо галереи)', () => {
    const detail = baseDetail({ photos: [] });
    render(<DetailMedia detail={detail} />);
    expect(screen.queryByTestId('photo-zoom')).toBeNull();
    expect(screen.getByText(/фото скоро появятся/i)).toBeTruthy();
  });

  it('hover на trigger подключает lens-overlay (фон-картинка)', () => {
    const { container } = render(<DetailMedia detail={withPhoto()} />);
    const trigger = screen.getByTestId('photo-zoom');
    expect(container.querySelector('.rt-photo-zoom-lens')).toBeNull();
    fireEvent.mouseEnter(trigger);
    const lens = container.querySelector('.rt-photo-zoom-lens') as HTMLElement;
    expect(lens).toBeTruthy();
    expect(lens.style.backgroundImage).toContain(
      'https://example.com/photo-1.jpg',
    );
    fireEvent.mouseLeave(trigger);
    expect(container.querySelector('.rt-photo-zoom-lens')).toBeNull();
  });

  it('навигация по фото не открывает modal (stopPropagation)', () => {
    const detail = baseDetail({
      photos: [
        { id: 1, image_url: 'https://example.com/p1.jpg', alt: '1' },
        { id: 2, image_url: 'https://example.com/p2.jpg', alt: '2' },
      ],
    });
    render(<DetailMedia detail={detail} />);
    const next = screen.getByLabelText('Следующее фото');
    fireEvent.click(next);
    expect(screen.queryByTestId('photo-modal')).toBeNull();
  });
});
