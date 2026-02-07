import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Мок @twa-dev/sdk
vi.mock('@twa-dev/sdk', () => ({
  default: {
    ready: vi.fn(),
    expand: vi.fn(),
    initData: '',
    initDataUnsafe: { user: { language_code: 'ru' } },
    colorScheme: 'light',
    themeParams: {},
    HapticFeedback: {
      impactOccurred: vi.fn(),
      notificationOccurred: vi.fn(),
    },
    MainButton: {
      text: '',
      onClick: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
    },
    BackButton: {
      onClick: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
    },
    showScanQrPopup: vi.fn(),
    closeScanQrPopup: vi.fn(),
    showConfirm: vi.fn(),
  },
}));

// Мок import.meta.env
vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000/api/v1');
