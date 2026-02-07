import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner, Placeholder, Section, Cell, Button } from '@telegram-apps/telegram-ui';
import {
  getTeam,
  getShifts,
  getShiftRegistrations,
  addTeamMember,
  removeTeamMember,
  type Team,
  type TeamMember,
} from '@/api/client';
import { showBackButton, hideBackButton, hapticNotification, showConfirm } from '@/lib/telegram';

export const TeamManagePage = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [team, setTeam] = useState<Team | null>(null);
  const [availableWorkers, setAvailableWorkers] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    showBackButton(() => navigate(-1));
    return () => hideBackButton();
  }, [navigate]);

  const loadData = async () => {
    if (!id) return;
    try {
      const teamData = await getTeam(id);
      setTeam(teamData);

      // Получаем зарегистрированных на смену работников, которые не в этом звене
      const shiftsResp = await getShifts({ status: 'active' });
      if (shiftsResp.results.length > 0) {
        const registrations = await getShiftRegistrations(shiftsResp.results[0].id) as Array<{
          worker: string;
          worker_name: string;
        }>;

        const teamMemberIds = new Set(teamData.memberships.map((m) => m.worker));
        const available = registrations
          .filter((r) => !teamMemberIds.has(r.worker))
          .map((r) => ({ id: r.worker, name: r.worker_name }));
        setAvailableWorkers(available);
      }
    } catch (error) {
      console.error('Failed to load team:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleAddMember = async (workerId: string) => {
    if (!id) return;
    setIsProcessing(true);
    try {
      await addTeamMember(id, { worker_id: workerId });
      hapticNotification('success');
      await loadData();
    } catch (error) {
      hapticNotification('error');
      console.error('Failed to add member:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveMember = async (membership: TeamMember) => {
    if (!id) return;
    const confirmed = await showConfirm(
      `${t('brigadier.removeMember')}: ${membership.worker_name}?`,
    );
    if (!confirmed) return;

    setIsProcessing(true);
    try {
      await removeTeamMember(id, membership.id);
      hapticNotification('success');
      await loadData();
    } catch (error) {
      hapticNotification('error');
      console.error('Failed to remove member:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spinner size="l" />
      </div>
    );
  }

  if (!team) {
    return (
      <Placeholder
        header={t('common.error')}
        description={t('common.noData')}
      >
        <div style={{ fontSize: '64px' }}>❌</div>
      </Placeholder>
    );
  }

  const roleIcon: Record<string, string> = {
    brigadier: '👷',
    worker: '🔧',
  };

  return (
    <div>
      {/* Текущие участники */}
      <Section header={`${t('team.members')} (${team.memberships.length})`}>
        {team.memberships.map((member) => (
          <Cell
            key={member.id}
            before={<span style={{ fontSize: '20px' }}>{roleIcon[member.worker_role] || '👤'}</span>}
            subtitle={member.worker_role === 'brigadier' ? t('team.brigadier') : t('team.worker')}
            after={
              member.worker_role !== 'brigadier' ? (
                <Button
                  size="s"
                  mode="outline"
                  disabled={isProcessing}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveMember(member);
                  }}
                  aria-label={`${t('brigadier.removeMember')}: ${member.worker_name}`}
                >
                  {t('common.delete')}
                </Button>
              ) : undefined
            }
          >
            {member.worker_name}
          </Cell>
        ))}
      </Section>

      {/* Доступные для добавления */}
      {availableWorkers.length > 0 && (
        <Section header={t('team.availableWorkers')}>
          {availableWorkers.map((worker) => (
            <Cell
              key={worker.id}
              before={<span style={{ fontSize: '20px' }}>👤</span>}
              after={
                <Button
                  size="s"
                  disabled={isProcessing}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddMember(worker.id);
                  }}
                  aria-label={`${t('brigadier.addMember')}: ${worker.name}`}
                >
                  {t('brigadier.addMember')}
                </Button>
              }
            >
              {worker.name}
            </Cell>
          ))}
        </Section>
      )}

      {availableWorkers.length === 0 && (
        <Section header={t('team.availableWorkers')}>
          <Placeholder description={t('team.noAvailableWorkers')}>
            <div style={{ fontSize: '48px' }}>👥</div>
          </Placeholder>
        </Section>
      )}
    </div>
  );
};
