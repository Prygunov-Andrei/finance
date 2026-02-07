import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner, Placeholder, Section, Cell, Button, Badge } from '@telegram-apps/telegram-ui';
import { getTeam, getMedia, type Team, type MediaItem } from '@/api/client';
import { showBackButton, hideBackButton } from '@/lib/telegram';

export const TeamDetailPage = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [team, setTeam] = useState<Team | null>(null);
  const [recentMedia, setRecentMedia] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    showBackButton(() => navigate(-1));
    return () => hideBackButton();
  }, [navigate]);

  useEffect(() => {
    if (!id) return;
    const loadData = async () => {
      try {
        const [teamData, mediaData] = await Promise.all([
          getTeam(id),
          getMedia({ team: id }),
        ]);
        setTeam(teamData);
        setRecentMedia(mediaData.results.slice(0, 5));
      } catch (error) {
        console.error('Failed to load team:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [id]);

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

  const mediaTypeIcon: Record<string, string> = {
    photo: '📷',
    video: '🎬',
    voice: '🎤',
    audio: '🎵',
    document: '📄',
    text: '💬',
  };

  const roleIcon: Record<string, string> = {
    brigadier: '👷',
    worker: '🔧',
  };

  return (
    <div>
      {/* Информация о звене */}
      <Section header={team.topic_name || t('brigadier.title')}>
        <Cell subtitle={t('team.status')}>
          {team.status === 'active' ? t('shift.active') : t('shift.closed')}
        </Cell>
        <Cell subtitle={t('team.brigadier')}>
          {team.brigadier_name || t('common.noData')}
        </Cell>
        <Cell subtitle={t('team.membersCount')}>
          {team.memberships.length}
        </Cell>
        <Cell subtitle={t('team.mediaTotal')}>
          {team.media_count}
        </Cell>
      </Section>

      {/* Участники */}
      <Section header={t('team.members')}>
        {team.memberships.map((member) => (
          <Cell
            key={member.id}
            before={<span style={{ fontSize: '20px' }}>{roleIcon[member.worker_role] || '👤'}</span>}
            subtitle={member.worker_role === 'brigadier' ? t('team.brigadier') : t('team.worker')}
          >
            {member.worker_name}
          </Cell>
        ))}
      </Section>

      {/* Последние медиа */}
      {recentMedia.length > 0 && (
        <Section header={`${t('team.recentMedia')} (${recentMedia.length})`}>
          {recentMedia.map((item) => (
            <Cell
              key={item.id}
              before={<span style={{ fontSize: '20px' }}>{mediaTypeIcon[item.media_type] || '📎'}</span>}
              subtitle={`${item.author_name} • ${new Date(item.created_at).toLocaleTimeString()}`}
              after={item.tag !== 'none' ? (
                <span style={{ color: item.tag === 'problem' ? 'red' : 'orange' }}>
                  {item.tag === 'problem' ? '🔴' : '🟡'}
                </span>
              ) : undefined}
            >
              {item.text_content || item.media_type}
            </Cell>
          ))}
        </Section>
      )}

      {/* Действия */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Button
          size="l"
          stretched
          onClick={() => navigate(`/team/${id}/media`)}
        >
          {t('brigadier.viewMedia')} ({team.media_count})
        </Button>
        <Button
          size="l"
          stretched
          mode="outline"
          onClick={() => navigate(`/team/${id}/report`)}
        >
          {t('brigadier.createReport')}
        </Button>
        <Button
          size="l"
          stretched
          mode="outline"
          onClick={() => navigate(`/team/${id}/manage`)}
        >
          {t('brigadier.manageTeam')}
        </Button>
      </div>
    </div>
  );
};
