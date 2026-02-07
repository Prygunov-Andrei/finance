import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Cell, Section, Spinner, Placeholder, Input } from '@telegram-apps/telegram-ui';
import { useNavigate } from 'react-router-dom';
import { getWorkers, createWorker, type Worker } from '@/api/client';
import { showBackButton, hideBackButton, hapticNotification } from '@/lib/telegram';

export const WorkersPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWorker, setNewWorker] = useState({ name: '', phone: '', telegram_id: '' });
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    showBackButton(() => navigate(-1));
    return () => hideBackButton();
  }, [navigate]);

  useEffect(() => {
    const loadWorkers = async () => {
      try {
        const resp = await getWorkers();
        setWorkers(resp.results);
      } catch (error) {
        console.error('Failed to load workers:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadWorkers();
  }, []);

  const handleAddWorker = async () => {
    if (!newWorker.name || !newWorker.telegram_id) return;
    setIsAdding(true);
    try {
      const worker = await createWorker({
        name: newWorker.name,
        phone: newWorker.phone,
        telegram_id: parseInt(newWorker.telegram_id),
      });
      setWorkers((prev) => [...prev, worker]);
      setShowAddForm(false);
      setNewWorker({ name: '', phone: '', telegram_id: '' });
      hapticNotification('success');
    } catch (error) {
      hapticNotification('error');
      console.error('Failed to add worker:', error);
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spinner size="l" />
      </div>
    );
  }

  const roleIcon: Record<string, string> = {
    worker: '👷',
    brigadier: '👨‍🔧',
  };

  return (
    <div>
      <Section header={`${t('contractor.manageWorkers')} (${workers.length})`}>
        {workers.length === 0 ? (
          <Placeholder description={t('common.noData')}>
            <div style={{ fontSize: '64px' }}>👥</div>
          </Placeholder>
        ) : (
          workers.map((worker) => (
            <Cell
              key={worker.id}
              before={<span style={{ fontSize: '24px' }}>{roleIcon[worker.role] || '👤'}</span>}
              subtitle={`${worker.phone || 'Нет телефона'} • ${worker.role === 'brigadier' ? 'Бригадир' : 'Монтажник'}`}
            >
              {worker.name}
            </Cell>
          ))
        )}
      </Section>

      {showAddForm && (
        <Section header={t('contractor.addWorker')}>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Input
              placeholder="ФИО"
              value={newWorker.name}
              onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })}
            />
            <Input
              placeholder="Телефон"
              value={newWorker.phone}
              onChange={(e) => setNewWorker({ ...newWorker, phone: e.target.value })}
            />
            <Input
              placeholder="Telegram ID"
              value={newWorker.telegram_id}
              onChange={(e) => setNewWorker({ ...newWorker, telegram_id: e.target.value })}
            />
            <Button size="m" onClick={handleAddWorker} disabled={isAdding}>
              {isAdding ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </Section>
      )}

      <div style={{ padding: '16px' }}>
        <Button
          size="l"
          stretched
          mode={showAddForm ? 'outline' : 'filled'}
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? t('common.cancel') : t('contractor.addWorker')}
        </Button>
      </div>
    </div>
  );
};
