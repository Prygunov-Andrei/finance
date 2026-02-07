import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Placeholder, Spinner } from '@telegram-apps/telegram-ui';
import { scanQrCode, getGeolocation, hapticNotification } from '@/lib/telegram';
import { registerForShift } from '@/api/client';

type RegistrationState = 'idle' | 'scanning' | 'locating' | 'registering' | 'success' | 'error';

interface RegisterPageProps {
  workerName: string;
}

export const RegisterPage = ({ workerName }: RegisterPageProps) => {
  const { t } = useTranslation();
  const [state, setState] = useState<RegistrationState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [shiftInfo, setShiftInfo] = useState<{ shiftId: string; topicLink?: string } | null>(null);

  const handleRegister = async () => {
    try {
      // 1. Сканируем QR
      setState('scanning');
      const qrData = await scanQrCode();

      let parsed: { shift_id: string; token: string };
      try {
        parsed = JSON.parse(qrData);
      } catch {
        throw new Error('Invalid QR code');
      }

      // 2. Получаем геолокацию
      setState('locating');
      const geo = await getGeolocation();

      // 3. Регистрируемся
      setState('registering');
      await registerForShift(parsed.shift_id, {
        qr_token: parsed.token,
        latitude: geo.latitude,
        longitude: geo.longitude,
      });

      setShiftInfo({ shiftId: parsed.shift_id });
      setState('success');
      hapticNotification('success');
    } catch (error) {
      setState('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
      hapticNotification('error');
    }
  };

  if (state === 'success') {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Placeholder
          header={t('worker.registered')}
          description={t('worker.shiftInfo')}
        >
          <div style={{ fontSize: '64px' }}>✅</div>
        </Placeholder>
      </div>
    );
  }

  if (['scanning', 'locating', 'registering'].includes(state)) {
    const statusText = state === 'scanning'
      ? t('worker.scanQr')
      : state === 'locating'
        ? t('common.loading')
        : t('common.loading');

    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spinner size="l" />
        <p style={{ marginTop: '16px', color: 'var(--tg-theme-hint-color)' }}>{statusText}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
      <Placeholder
        header={`${t('worker.title')}`}
        description={`${workerName}`}
      >
        <div style={{ fontSize: '64px' }}>👷</div>
      </Placeholder>

      {state === 'error' && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: 'var(--tg-theme-destructive-text-color, #ff3b30)',
          color: '#fff',
          borderRadius: '12px',
          width: '100%',
          textAlign: 'center',
        }}>
          {errorMessage}
        </div>
      )}

      <Button
        size="l"
        stretched
        onClick={handleRegister}
      >
        {t('worker.registerButton')}
      </Button>
    </div>
  );
};
