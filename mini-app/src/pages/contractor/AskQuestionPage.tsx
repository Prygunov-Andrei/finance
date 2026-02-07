import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner, Placeholder, Section, Cell, Button } from '@telegram-apps/telegram-ui';
import {
  getReport,
  getQuestions,
  createQuestion,
  type Report,
  type Question,
} from '@/api/client';
import { showBackButton, hideBackButton, hapticNotification } from '@/lib/telegram';

export const AskQuestionPage = () => {
  const { t } = useTranslation();
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionText, setQuestionText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    showBackButton(() => navigate(-1));
    return () => hideBackButton();
  }, [navigate]);

  const loadData = async () => {
    if (!reportId) return;
    try {
      const [reportData, questionsData] = await Promise.all([
        getReport(reportId),
        getQuestions({ report: reportId }),
      ]);
      setReport(reportData);
      setQuestions(questionsData.results);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [reportId]);

  const handleSubmit = async () => {
    if (!reportId || !questionText.trim()) return;

    setIsSubmitting(true);
    try {
      await createQuestion({ report_id: reportId, text: questionText });
      setQuestionText('');
      hapticNotification('success');
      // Обновляем список вопросов
      await loadData();
    } catch (error) {
      hapticNotification('error');
      console.error('Failed to ask question:', error);
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

  const statusIcon: Record<string, string> = {
    pending: '❓',
    answered: '✅',
  };

  return (
    <div>
      {/* Информация об отчёте */}
      <Section header={`${t('contractor.askQuestion')} — ${t('report.' + report.report_type)} #${report.report_number}`}>
        <Cell subtitle={report.team_name || ''}>
          {t('report.mediaCount')}: {report.media_count}
        </Cell>
      </Section>

      {/* Существующие вопросы */}
      {questions.length > 0 && (
        <Section header={`${t('question.existing')} (${questions.length})`}>
          {questions.map((q) => (
            <div key={q.id} style={{ padding: '0' }}>
              <Cell
                before={<span style={{ fontSize: '20px' }}>{statusIcon[q.status] || '❓'}</span>}
                subtitle={`${q.author_name} • ${new Date(q.created_at).toLocaleString()}`}
              >
                {q.text}
              </Cell>
              {q.answers.map((answer) => (
                <Cell
                  key={answer.id}
                  before={<span style={{ fontSize: '16px', marginLeft: '24px' }}>💬</span>}
                  subtitle={`${answer.author_name} • ${new Date(answer.created_at).toLocaleString()}`}
                  style={{ paddingLeft: '32px' }}
                >
                  {answer.text}
                </Cell>
              ))}
            </div>
          ))}
        </Section>
      )}

      {/* Новый вопрос */}
      <Section header={t('question.new')}>
        <div style={{ padding: '12px 16px' }}>
          <textarea
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder={t('question.placeholder')}
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
            aria-label={t('question.placeholder')}
          />
        </div>
      </Section>

      {/* Отправить */}
      <div style={{ padding: '16px' }}>
        <Button
          size="l"
          stretched
          disabled={isSubmitting || !questionText.trim()}
          onClick={handleSubmit}
        >
          {isSubmitting ? t('common.loading') : t('question.send')}
        </Button>
      </div>
    </div>
  );
};
