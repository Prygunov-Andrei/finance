import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner, Placeholder, Section, Cell, Button, Checkbox } from '@telegram-apps/telegram-ui';
import { getTeam, getMedia, createReport, type Team, type MediaItem, type Report } from '@/api/client';
import { showBackButton, hideBackButton, hapticNotification } from '@/lib/telegram';

type ReportType = 'intermediate' | 'final' | 'supplement';

export const ReportCreatePage = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [team, setTeam] = useState<Team | null>(null);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [reportType, setReportType] = useState<ReportType>('intermediate');
  const [reportText, setReportText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [createdReport, setCreatedReport] = useState<Report | null>(null);

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
        setMediaItems(mediaData.results);
        // По умолчанию выбираем все медиа
        setSelectedMediaIds(mediaData.results.map((m) => m.id));
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [id]);

  const handleToggleMedia = (mediaId: string) => {
    setSelectedMediaIds((prev) =>
      prev.includes(mediaId) ? prev.filter((i) => i !== mediaId) : [...prev, mediaId],
    );
  };

  const handleSelectAll = () => {
    if (selectedMediaIds.length === mediaItems.length) {
      setSelectedMediaIds([]);
    } else {
      setSelectedMediaIds(mediaItems.map((m) => m.id));
    }
  };

  const handleCreate = async () => {
    if (!id) return;
    setIsCreating(true);
    try {
      const report = await createReport({
        team_id: id,
        report_type: reportType,
        media_ids: selectedMediaIds,
        text: reportText || undefined,
      });
      setCreatedReport(report);
      hapticNotification('success');
    } catch (error) {
      hapticNotification('error');
      console.error('Failed to create report:', error);
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

  if (createdReport) {
    return (
      <div style={{ padding: '24px' }}>
        <Placeholder
          header={t('brigadier.reportCreated')}
          description={`${t('report.' + createdReport.report_type)} #${createdReport.report_number}`}
        >
          <div style={{ fontSize: '64px' }}>✅</div>
        </Placeholder>
        <div style={{ padding: '16px' }}>
          <Button size="l" stretched onClick={() => navigate(-1)}>
            {t('common.back')}
          </Button>
        </div>
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

  const reportTypes: { value: ReportType; label: string }[] = [
    { value: 'intermediate', label: t('report.intermediate') },
    { value: 'final', label: t('report.final') },
    { value: 'supplement', label: t('report.supplement') },
  ];

  return (
    <div>
      {/* Тип отчёта */}
      <Section header={t('report.selectType')}>
        {reportTypes.map((rt) => (
          <Cell
            key={rt.value}
            before={
              <span style={{ fontSize: '20px' }}>
                {reportType === rt.value ? '🔘' : '⚪'}
              </span>
            }
            onClick={() => setReportType(rt.value)}
          >
            {rt.label}
          </Cell>
        ))}
      </Section>

      {/* Комментарий */}
      <Section header={t('report.comment')}>
        <div style={{ padding: '12px 16px' }}>
          <textarea
            value={reportText}
            onChange={(e) => setReportText(e.target.value)}
            placeholder={t('report.commentPlaceholder')}
            rows={3}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid var(--tg-theme-hint-color)',
              backgroundColor: 'var(--tg-theme-secondary-bg-color)',
              color: 'var(--tg-theme-text-color)',
              resize: 'vertical',
              fontFamily: 'inherit',
              fontSize: '14px',
            }}
            aria-label={t('report.comment')}
          />
        </div>
      </Section>

      {/* Медиа для отчёта */}
      <Section header={`${t('report.selectMedia')} (${selectedMediaIds.length}/${mediaItems.length})`}>
        {mediaItems.length === 0 ? (
          <Cell>{t('brigadier.noMedia')}</Cell>
        ) : (
          <>
            <Cell
              before={
                <Checkbox
                  checked={selectedMediaIds.length === mediaItems.length}
                  onChange={handleSelectAll}
                />
              }
              onClick={handleSelectAll}
            >
              {t('report.selectAll')}
            </Cell>
            {mediaItems.map((item) => (
              <Cell
                key={item.id}
                before={
                  <Checkbox
                    checked={selectedMediaIds.includes(item.id)}
                    onChange={() => handleToggleMedia(item.id)}
                  />
                }
                after={<span style={{ fontSize: '16px' }}>{mediaTypeIcon[item.media_type] || '📎'}</span>}
                subtitle={`${item.author_name} • ${new Date(item.created_at).toLocaleTimeString()}`}
                onClick={() => handleToggleMedia(item.id)}
              >
                {item.text_content || item.media_type}
              </Cell>
            ))}
          </>
        )}
      </Section>

      {/* Создать */}
      <div style={{ padding: '16px' }}>
        <Button
          size="l"
          stretched
          disabled={isCreating}
          onClick={handleCreate}
        >
          {isCreating ? t('common.loading') : t('brigadier.createReport')}
        </Button>
      </div>
    </div>
  );
};
