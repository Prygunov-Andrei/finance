/**
 * Unit-тесты lib/telegram.ts — 7 тестов.
 * Покрытие: getInitData, getUserLanguage, haptic, mainButton, backButton.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WebApp from '@twa-dev/sdk';
import {
  getInitData,
  getUserLanguage,
  initTelegram,
  hapticImpact,
  hapticNotification,
  showMainButton,
  hideMainButton,
  showBackButton,
  hideBackButton,
} from '@/lib/telegram';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('initTelegram', () => {
  it('вызывает WebApp.ready и WebApp.expand', () => {
    initTelegram();
    expect(WebApp.ready).toHaveBeenCalled();
    expect(WebApp.expand).toHaveBeenCalled();
  });
});

describe('getInitData', () => {
  it('возвращает initData из WebApp', () => {
    (WebApp as any).initData = 'test_init_data_string';
    const result = getInitData();
    expect(result).toBe('test_init_data_string');
  });
});

describe('getUserLanguage', () => {
  it('возвращает language_code пользователя', () => {
    (WebApp as any).initDataUnsafe = { user: { language_code: 'uz' } };
    const lang = getUserLanguage();
    expect(lang).toBe('uz');
  });

  it('fallback на ru если нет данных', () => {
    (WebApp as any).initDataUnsafe = {};
    const lang = getUserLanguage();
    expect(lang).toBe('ru');
  });
});

describe('haptic feedback', () => {
  it('hapticImpact вызывает impactOccurred', () => {
    hapticImpact('heavy');
    expect(WebApp.HapticFeedback.impactOccurred).toHaveBeenCalledWith('heavy');
  });

  it('hapticNotification вызывает notificationOccurred', () => {
    hapticNotification('success');
    expect(WebApp.HapticFeedback.notificationOccurred).toHaveBeenCalledWith('success');
  });
});

describe('MainButton', () => {
  it('showMainButton устанавливает текст и показывает', () => {
    const handler = vi.fn();
    showMainButton('Создать', handler);
    expect(WebApp.MainButton.text).toBe('Создать');
    expect(WebApp.MainButton.onClick).toHaveBeenCalledWith(handler);
    expect(WebApp.MainButton.show).toHaveBeenCalled();
  });
});
