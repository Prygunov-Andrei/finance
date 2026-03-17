import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import newsService, { News } from '../services/newsService';
import { Comment } from '../services/commentService';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Calendar, ArrowLeft, AlertCircle, Edit, Trash2 } from 'lucide-react';
import MainLayout from '../components/MainLayout';
import { useTranslation } from 'react-i18next';
import { getLocalizedField, getLocalizedDate } from '../utils/i18nHelpers';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { getServerBaseUrl, getMediaUrl } from '../config/api';
import { extractAndProcessContent } from '../utils/htmlHelpers';
import CommentList, { CommentListRef } from '../components/CommentList';
import CommentForm from '../components/CommentForm';

export default function NewsDetail() {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const { t } = useTranslation();
  const [news, setNews] = useState<News | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const commentListRef = useRef<CommentListRef>(null);

  const isAdmin = user?.is_staff === true;

  useEffect(() => {
    if (id) {
      loadNews(parseInt(id));
    }
  }, [id, language]);

  const loadNews = async (newsId: number) => {
    try {
      setLoading(true);
      setError(null);
      const data = await newsService.getNewsById(newsId, language);
      setNews(data);
    } catch (err) {
      console.error('Error loading news:', err);
      setError(t('news.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!news) return;
    
    setDeleting(true);
    try {
      await newsService.deleteNews(news.id);
      toast.success('Новость удалена');
      navigate('/news');
    } catch (error) {
      console.error('Failed to delete news:', error);
      toast.error('Не удалось удалить новость');
    } finally {
      setDeleting(false);
    }
  };

  // Форматировать дату
  const formatDate = (dateString: string): string => {
    return getLocalizedDate(dateString, language);
  };

  // Получаем локализованные поля
  const title = news ? getLocalizedField(news, 'title', language) : '';
  const body = news ? getLocalizedField(news, 'body', language) : '';

  // Извлекаем первое изображение и обрабатываем контент
  const { firstImage, contentHtml } = useMemo(() => {
    return extractAndProcessContent(body);
  }, [body]);

  const getStatusBadge = (item: News) => {
    if (!isAdmin || !item.status) return null;
    
    const statusConfig = {
      draft: { label: 'Черновик', variant: 'secondary' as const },
      scheduled: { label: 'Запланировано', variant: 'outline' as const },
      published: { label: 'Опубликовано', variant: 'default' as const },
    };

    const config = statusConfig[item.status];
    if (!config) return null;

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-muted-foreground">{t('common.loading')}</div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !news) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="max-w-4xl mx-auto">
            <Card className="p-6 border-destructive bg-destructive/10">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-destructive font-medium">{error || t('news.notFound')}</p>
                </div>
              </div>
            </Card>
            <Button asChild className="mt-4" variant="outline">
              <Link to="/news">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('news.backToList')}
              </Link>
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <Button asChild variant="ghost">
              <Link to="/news">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('news.backToList')}
              </Link>
            </Button>
            
            {isAdmin && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <Link to={`/news/edit/${news.id}`}>
                    <Edit className="w-4 h-4 mr-2" />
                    Редактировать
                  </Link>
                </Button>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deleting}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Удалить
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Удалить новость?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Это действие нельзя отменить. Новость будет удалена навсегда.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Удалить
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>

          <Card className="overflow-hidden">
            <article className="p-8">
              <div className="flex items-start justify-between gap-4 mb-4">
                <h1 className="flex-1">{title}</h1>
                {getStatusBadge(news)}
              </div>
              
              <div className="flex items-center gap-2 text-muted-foreground mb-6 pb-6 border-b border-border">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(news.pub_date)}</span>
              </div>

              {/* Основной контент с изображениями */}
              <style>{`
                .article-image {
                  float: left;
                  max-width: 400px;
                  margin: 0 3rem 2rem 0;
                  border-radius: 0.5rem;
                }
                @media (max-width: 768px) {
                  .article-image {
                    float: none;
                    max-width: 100%;
                    margin: 0 0 1.5rem 0;
                  }
                }
                .article-content {
                  line-height: 1.75;
                }
                .article-content p {
                  margin-bottom: 1rem;
                }
                .article-content h1, .article-content h2, .article-content h3 {
                  margin-top: 1.5rem;
                  margin-bottom: 0.75rem;
                }
                .article-content h4, .article-content h5, .article-content h6 {
                  margin-top: 1.25rem;
                  margin-bottom: 0.5rem;
                }
                .article-content a {
                  color: hsl(var(--primary));
                  text-decoration: underline;
                }
                .article-content img {
                  max-width: 100%;
                  height: auto;
                  border-radius: 0.5rem;
                  margin: 1rem 0;
                }
                .article-content ul, .article-content ol {
                  margin-bottom: 1rem;
                  padding-left: 2rem;
                }
                .article-content li {
                  margin-bottom: 0.5rem;
                }
                .article-content blockquote {
                  border-left: 4px solid hsl(var(--border));
                  padding-left: 1rem;
                  margin: 1rem 0;
                  color: hsl(var(--muted-foreground));
                }
                .article-content code {
                  background: hsl(var(--muted));
                  padding: 0.2rem 0.4rem;
                  border-radius: 0.25rem;
                  font-size: 0.875em;
                }
                .article-content pre {
                  background: hsl(var(--muted));
                  padding: 1rem;
                  border-radius: 0.5rem;
                  overflow-x: auto;
                  margin: 1rem 0;
                }
                .article-content pre code {
                  background: none;
                  padding: 0;
                }
                .article-content::after {
                  content: "";
                  display: table;
                  clear: both;
                }
              `}</style>
              <div className="article-content">
                {firstImage && (
                  <ImageWithFallback
                    src={firstImage}
                    alt={title}
                    style={{
                      float: 'left',
                      maxWidth: '400px',
                      margin: '0 3rem 2rem 0',
                      borderRadius: '0.5rem',
                    }}
                  />
                )}
                <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
              </div>
            </article>
          </Card>

          {/* Секция комментариев */}
          <div className="mt-8 space-y-6">
            <Card className="p-6">
              <CommentList ref={commentListRef} newsId={news.id} comments={comments} setComments={setComments} />
            </Card>
            
            <Card className="p-6">
              <CommentForm newsId={news.id} onCommentAdded={(comment) => setComments([...comments, comment])} />
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}