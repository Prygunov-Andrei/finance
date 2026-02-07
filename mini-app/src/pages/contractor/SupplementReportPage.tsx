import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner, Placeholder, Section, Cell, Button, Checkbox } from '@telegram-apps/telegram-ui';
import {
  getReport,
  getMedia,
  supplementReport,
  type Report,
  type MediaItem,
} from '@/api/client';
import { showBackButton, hideBackButton, hapticNotification } from '@/lib/telegram';

export const SupplementReportPage = () => {
  const { t } = useTranslation();
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report | null>(null);
  const [teamMedia, setTeamMedia] = useState<MediaItem[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [supplementText, setSupplementText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    showBackButton(() => navigate(-1));
    return () => hideBackButton();
  }, [navigate]);

  useEffect(() => {
    if (!reportId) return;
    const loadData = async () => {
      try {
        const reportData = await getReport(reportId);
        setReport(reportData);

        if (reportData.team) {
          const mediaData = await getMedia({ team: reportData.team });
          setTeamMedia(mediaData.results);
        }
      } catch (error) {
        console.error('Failed to load report:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [reportId]);

  const handleToggleMedia = (mediaId: string) => {
    setSelectedMediaIds((prev) =>
      prev.includes(mediaId) ? prev.filter((i) => i !== mediaId) : [...prev, mediaId],
    );
  };

  const handleSubmit = async () => {
    if (!reportId) return;
    if (!supplementText.trim() && selectedMediaIds.length === 0) return;

    setIsSubmitting(true);
    try {
      await supplementReport(reportId, {
        text: supplementText || undefined,
        media_ids: selectedMediaIds.length > 0 ? selectedMediaIds : undefined,
      });
      setIsSuccess(true);
      hapticNotification('success');
    } catch (error) {
      hapticNotification('error');
      console.error('Failed to supplement report:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spinner size="l" />
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div style={{ padding: '24px' }}>
        <Placeholder
          header={t('report.supplemented')}
          description={t('report.supplementSuccess')}
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

  if (!report) {
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

  return (
    <div>
      {/* Информация об отчёте */}
      <Section header={`${t('contractor.supplementReport')} #${report.report_number}`}>
        <Cell subtitle={t('report.type')}>
          {t('report.' + report.report_type)}
        </Cell>
        <Cell subtitle={t('report.mediaCount')}>
          {report.media_count}
        </Cell>
      </Section>

      {/* Дополнительный текст */}
      <Section header={t('report.additionalText')}>
        <div style={{ padding: '12px 16px' }}>
          <textarea
            value={supplementText}
            onChange={(e) => setSupplementText(e.target.value)}
            placeholder={t('report.supplementPlaceholder')}
            rows={4}
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
            aria-label={t('report.additionalText')}
          />
        </div>
      </Section>

      {/* Дополнительные медиа */}
      {teamMedia.length > 0 && (
        <Section header={`${t('report.additionalMedia')} (${selectedMediaIds.length})`}>
          {teamMedia.map((item) => (
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
        </Section>
      )}

      {/* Отправить */}
      <div style={{ padding: '16px' }}>
        <Button
          size="l"
          stretched
          disabled={isSubmitting || (!supplementText.trim() && selectedMediaIds.length === 0)}
          onClick={handleSubmit}
        >
          {isSubmitting ? t('common.loading') : t('contractor.supplementReport')}
        </Button>
      </div>
    </div>
  );
};
