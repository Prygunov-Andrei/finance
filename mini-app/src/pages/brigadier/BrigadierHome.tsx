import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Cell, Section, Placeholder, Spinner, Badge } from '@telegram-apps/telegram-ui';
import { useNavigate } from 'react-router-dom';
import { getTeams, getShifts, type Team, type Shift } from '@/api/client';

interface BrigadierHomeProps {
  workerId: string;
}

export const BrigadierHome = ({ workerId }: BrigadierHomeProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [shiftsResp, teamsResp] = await Promise.all([
          getShifts({ status: 'active' }),
          getTeams({ status: 'active' }),
        ]);

        if (shiftsResp.results.length > 0) {
          setActiveShift(shiftsResp.results[0]);
        }

        // Фильтруем звенья где текущий пользователь бригадир
        const myTeams = teamsResp.results.filter(team => team.brigadier === workerId);
        setTeams(myTeams);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [workerId]);

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spinner size="l" />
      </div>
    );
  }

  if (!activeShift) {
    return (
      <div style={{ padding: '24px' }}>
        <Placeholder
          header={t('brigadier.title')}
          description="Нет активных смен"
        >
          <div style={{ fontSize: '64px' }}>📋</div>
        </Placeholder>
      </div>
    );
  }

  return (
    <div>
      {/* Информация о смене */}
      <Section header={t('worker.shiftInfo')}>
        <Cell
          subtitle={`${activeShift.date} | ${activeShift.start_time} — ${activeShift.end_time}`}
        >
          {activeShift.object_name}
        </Cell>
      </Section>

      {/* Мои звенья */}
      <Section header={t('brigadier.title')}>
        {teams.length === 0 ? (
          <Placeholder description={t('common.noData')}>
            <Button size="m" onClick={() => navigate('/team/create')}>
              {t('brigadier.createTeam')}
            </Button>
          </Placeholder>
        ) : (
          teams.map((team) => (
            <Cell
              key={team.id}
              subtitle={`${team.memberships.length} чел. | ${team.media_count} медиа`}
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
        {teams.length > 0 && (
          <>
            <Button
              size="l"
              stretched
              onClick={() => navigate(`/team/${teams[0].id}/media`)}
            >
              {t('brigadier.viewMedia')}
            </Button>
            <Button
              size="l"
              stretched
              mode="outline"
              onClick={() => navigate(`/team/${teams[0].id}/report`)}
            >
              {t('brigadier.createReport')}
            </Button>
          </>
        )}
        <Button
          size="l"
          stretched
          mode="outline"
          onClick={() => navigate('/team/create')}
        >
          {t('brigadier.createTeam')}
        </Button>
      </div>
    </div>
  );
};
