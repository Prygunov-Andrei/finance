import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Cell, Section, Placeholder, Spinner, Badge } from '@telegram-apps/telegram-ui';
import { useNavigate } from 'react-router-dom';
import { getTeams, getShifts, type Team, type Shift } from '@/api/client';

export const ContractorHome = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [shiftsResp, teamsResp] = await Promise.all([
          getShifts({ status: 'active' }),
          getTeams({ status: 'active' }),
        ]);
        setShifts(shiftsResp.results);
        setTeams(teamsResp.results);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spinner size="l" />
      </div>
    );
  }

  return (
    <div>
      {/* Активные смены */}
      <Section header={`${t('shift.active')} (${shifts.length})`}>
        {shifts.length === 0 ? (
          <Placeholder description="Нет активных смен">
            <Button size="m" onClick={() => navigate('/shift/open')}>
              {t('contractor.openShift')}
            </Button>
          </Placeholder>
        ) : (
          shifts.map((shift) => (
            <Cell
              key={shift.id}
              subtitle={`${shift.date} | ${shift.start_time} — ${shift.end_time}`}
              after={
                <Badge type="number">{shift.registrations_count}</Badge>
              }
            >
              {shift.object_name}
            </Cell>
          ))
        )}
      </Section>

      {/* Все звенья */}
      <Section header={`${t('contractor.allTeams')} (${teams.length})`}>
        {teams.length === 0 ? (
          <Cell>{t('common.noData')}</Cell>
        ) : (
          teams.map((team) => (
            <Cell
              key={team.id}
              subtitle={`${team.memberships.length} чел. | ${team.brigadier_name || 'Нет бригадира'}`}
              after={<Badge type="number">{team.media_count}</Badge>}
              onClick={() => navigate(`/team/${team.id}`)}
            >
              {team.topic_name}
            </Cell>
          ))
        )}
      </Section>

      {/* Действия */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Button size="l" stretched onClick={() => navigate('/shift/open')}>
          {t('contractor.openShift')}
        </Button>
        <Button size="l" stretched mode="outline" onClick={() => navigate('/workers')}>
          {t('contractor.manageWorkers')}
        </Button>
        <Button size="l" stretched mode="outline" onClick={() => navigate('/settings')}>
          {t('contractor.settings')}
        </Button>
      </div>
    </div>
  );
};
