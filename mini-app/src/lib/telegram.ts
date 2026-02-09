import WebApp from '@twa-dev/sdk';

/**
 * Инициализация Telegram WebApp SDK.
 */
export const initTelegram = () => {
  WebApp.ready();
  WebApp.expand();
};

/**
 * Получение initData для аутентификации.
 */
export const getInitData = (): string => {
  return WebApp.initData;
};

/**
 * Получение языка пользователя из Telegram.
 */
export const getUserLanguage = (): string => {
  return WebApp.initDataUnsafe?.user?.language_code || 'ru';
};

/**
 * Сканирование QR-кода через нативный Telegram scanner.
 */
export const scanQrCode = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const handleClose = () => {
      if (!resolved) {
        resolved = true;
        reject(new Error('QR_CANCELLED'));
      }
    };

    try {
      // Слушаем событие закрытия сканера (пользователь нажал "Отмена")
      WebApp.onEvent('scanQrPopupClosed', handleClose);

      WebApp.showScanQrPopup(
        { text: 'Наведите камеру на QR-код смены' },
        (data: string) => {
          if (data && !resolved) {
            resolved = true;
            WebApp.offEvent('scanQrPopupClosed', handleClose);
            WebApp.closeScanQrPopup();
            resolve(data);
            return true as true;
          }
        },
      );
    } catch (error) {
      resolved = true;
      reject(error);
    }
  });
};

/**
 * Получение геолокации.
 */
export const getGeolocation = (): Promise<{ latitude: number; longitude: number }> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  });
};

/**
 * Haptic feedback.
 */
export const hapticImpact = (style: 'light' | 'medium' | 'heavy' = 'medium') => {
  WebApp.HapticFeedback.impactOccurred(style);
};

export const hapticNotification = (type: 'error' | 'success' | 'warning') => {
  WebApp.HapticFeedback.notificationOccurred(type);
};

/**
 * Main Button.
 */
export const showMainButton = (text: string, onClick: () => void) => {
  WebApp.MainButton.text = text;
  WebApp.MainButton.onClick(onClick);
  WebApp.MainButton.show();
};

export const hideMainButton = () => {
  WebApp.MainButton.hide();
};

/**
 * Back Button.
 */
export const showBackButton = (onClick: () => void) => {
  WebApp.BackButton.onClick(onClick);
  WebApp.BackButton.show();
};

export const hideBackButton = () => {
  WebApp.BackButton.hide();
};

/**
 * Показать popup подтверждения.
 */
export const showConfirm = (message: string): Promise<boolean> => {
  return new Promise((resolve) => {
    WebApp.showConfirm(message, (confirmed) => {
      resolve(confirmed);
    });
  });
};

/**
 * Тема Telegram.
 */
export const getThemeParams = () => WebApp.themeParams;
export const getColorScheme = () => WebApp.colorScheme;
