import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, Section } from '@telegram-apps/telegram-ui';
import { useNavigate } from 'react-router-dom';
import { createShift } from '@/api/client';
import { showBackButton, hideBackButton, hapticNotification } from '@/lib/telegram';

export const OpenShiftPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    shift_type: 'day',
    start_time: '09:00',
    end_time: '18:00',
  });

  useEffect(() => {
    showBackButton(() => navigate(-1));
    return () => hideBackButton();
  }, [navigate]);

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      await createShift(formData);
      hapticNotification('success');
      navigate('/');
    } catch (error) {
      hapticNotification('error');
      console.error('Failed to create shift:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div>
      <Section header={t('contractor.openShift')}>
        <Cell header="Дата">
          <Input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />
        </Cell>
        <Cell header="Время начала">
          <Input
            type="time"
            value={formData.start_time}
            onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
          />
        </Cell>
        <Cell header="Время окончания">
          <Input
            type="time"
            value={formData.end_time}
            onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
          />
        </Cell>
      </Section>

      <div style={{ padding: '16px' }}>
        <Button
          size="l"
          stretched
          disabled={isCreating}
          onClick={handleCreate}
        >
          {isCreating ? t('common.loading') : t('contractor.openShift')}
        </Button>
      </div>
    </div>
  );
};

// Simple Cell wrapper for form fields
const Cell = ({ header, children }: { header: string; children: React.ReactNode }) => (
  <div style={{ padding: '12px 16px' }}>
    <div style={{ fontSize: '13px', color: 'var(--tg-theme-hint-color)', marginBottom: '4px' }}>
      {header}
    </div>
    {children}
  </div>
);
