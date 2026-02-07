import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Section, Button, Spinner } from '@telegram-apps/telegram-ui';
import { useNavigate } from 'react-router-dom';
import { showBackButton, hideBackButton, hapticNotification } from '@/lib/telegram';

interface Settings {
  teamCreation: 'brigadier' | 'anyone';
  shiftClose: 'contractor' | 'brigadier';
  autoCloseMinutes: number;
  reportWarningMinutes: number;
}

const DEFAULT_SETTINGS: Settings = {
  teamCreation: 'brigadier',
  shiftClose: 'contractor',
  autoCloseMinutes: 60,
  reportWarningMinutes: 30,
};

const STORAGE_KEY = 'worklog_settings';

const loadSettings = (): Settings => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
};

const saveSettings = (settings: Settings): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

export const SettingsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    showBackButton(() => navigate(-1));
    return () => hideBackButton();
  }, [navigate]);

  const handleChange = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      saveSettings(settings);
      hapticNotification('success');
      setHasChanges(false);
    } catch (error) {
      hapticNotification('error');
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const teamCreationOptions = [
    { value: 'brigadier' as const, label: t('settings.onlyBrigadier') },
    { value: 'anyone' as const, label: t('settings.anyRegistered') },
  ];

  const shiftCloseOptions = [
    { value: 'contractor' as const, label: t('settings.onlyContractor') },
    { value: 'brigadier' as const, label: t('settings.brigadierToo') },
  ];

  const minuteOptions = [15, 30, 45, 60, 90, 120];

  return (
    <div>
      {/* Создание звеньев */}
      <Section header={t('settings.teamCreation')}>
        {teamCreationOptions.map((opt) => (
          <Cell
            key={opt.value}
            before={
              <span style={{ fontSize: '20px' }}>
                {settings.teamCreation === opt.value ? '🔘' : '⚪'}
              </span>
            }
            onClick={() => handleChange('teamCreation', opt.value)}
          >
            {opt.label}
          </Cell>
        ))}
      </Section>

      {/* Закрытие смены */}
      <Section header={t('settings.shiftClose')}>
        {shiftCloseOptions.map((opt) => (
          <Cell
            key={opt.value}
            before={
              <span style={{ fontSize: '20px' }}>
                {settings.shiftClose === opt.value ? '🔘' : '⚪'}
              </span>
            }
            onClick={() => handleChange('shiftClose', opt.value)}
          >
            {opt.label}
          </Cell>
        ))}
      </Section>

      {/* Авто-закрытие */}
      <Section header={t('settings.autoClose')}>
        {minuteOptions.map((mins) => (
          <Cell
            key={mins}
            before={
              <span style={{ fontSize: '20px' }}>
                {settings.autoCloseMinutes === mins ? '🔘' : '⚪'}
              </span>
            }
            onClick={() => handleChange('autoCloseMinutes', mins)}
          >
            {mins} {t('settings.minutes')}
          </Cell>
        ))}
      </Section>

      {/* Предупреждение об отчёте */}
      <Section header={t('settings.reportWarning')}>
        {minuteOptions.map((mins) => (
          <Cell
            key={mins}
            before={
              <span style={{ fontSize: '20px' }}>
                {settings.reportWarningMinutes === mins ? '🔘' : '⚪'}
              </span>
            }
            onClick={() => handleChange('reportWarningMinutes', mins)}
          >
            {mins} {t('settings.minutes')}
          </Cell>
        ))}
      </Section>

      {/* Сохранить */}
      <div style={{ padding: '16px' }}>
        <Button
          size="l"
          stretched
          disabled={!hasChanges || isSaving}
          onClick={handleSave}
        >
          {isSaving ? t('common.loading') : t('common.save')}
        </Button>
      </div>
    </div>
  );
};
