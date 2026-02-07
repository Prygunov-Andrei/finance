import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Cell, Checkbox, Section, Spinner, Placeholder } from '@telegram-apps/telegram-ui';
import { useNavigate } from 'react-router-dom';
import { getShifts, getShiftRegistrations, createTeam, type Worker } from '@/api/client';
import { showBackButton, hideBackButton, hapticNotification } from '@/lib/telegram';

interface CreateTeamPageProps {
  workerId: string;
}

export const CreateTeamPage = ({ workerId }: CreateTeamPageProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [registeredWorkers, setRegisteredWorkers] = useState<Array<{ id: string; name: string; photo: string }>>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([workerId]);
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    showBackButton(() => navigate(-1));
    return () => hideBackButton();
  }, [navigate]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const shiftsResp = await getShifts({ status: 'active' });
        if (shiftsResp.results.length === 0) return;

        const shift = shiftsResp.results[0];
        setActiveShiftId(shift.id);

        const registrations = await getShiftRegistrations(shift.id) as Array<{
          worker: string;
          worker_name: string;
        }>;

        setRegisteredWorkers(
          registrations.map((r) => ({
            id: r.worker,
            name: r.worker_name,
            photo: '',
          })),
        );
      } catch (error) {
        console.error('Failed to load registrations:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleToggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleCreate = async () => {
    if (!activeShiftId || selectedIds.length === 0) return;

    setIsCreating(true);
    try {
      await createTeam({
        shift_id: activeShiftId,
        member_ids: selectedIds,
        brigadier_id: workerId,
      });
      hapticNotification('success');
      navigate('/');
    } catch (error) {
      hapticNotification('error');
      console.error('Failed to create team:', error);
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spinner size="l" />
      </div>
    );
  }

  if (registeredWorkers.length === 0) {
    return (
      <Placeholder
        header={t('brigadier.selectMembers')}
        description={t('common.noData')}
      >
        <div style={{ fontSize: '64px' }}>👥</div>
      </Placeholder>
    );
  }

  return (
    <div>
      <Section header={t('brigadier.selectMembers')}>
        {registeredWorkers.map((worker) => (
          <Cell
            key={worker.id}
            before={
              <Checkbox
                checked={selectedIds.includes(worker.id)}
                onChange={() => handleToggle(worker.id)}
              />
            }
          >
            {worker.name}
          </Cell>
        ))}
      </Section>

      <div style={{ padding: '16px' }}>
        <Button
          size="l"
          stretched
          disabled={selectedIds.length === 0 || isCreating}
          onClick={handleCreate}
        >
          {isCreating ? t('common.loading') : `${t('brigadier.createTeam')} (${selectedIds.length})`}
        </Button>
      </div>
    </div>
  );
};
