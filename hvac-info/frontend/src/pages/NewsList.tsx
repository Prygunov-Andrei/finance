import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import newsService, { News } from '../services/newsService';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Calendar, AlertCircle, RefreshCw, Edit, Trash2, FileText, ExternalLink, Sparkles, AlertTriangle } from 'lucide-react';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import MainLayout from '../components/MainLayout';
import { useTranslation } from 'react-i18next';
import { getLocalizedField, getLocalizedDate } from '../utils/i18nHelpers';
import { getExcerpt } from '../utils/htmlHelpers';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { getMediaUrl, getServerBaseUrl } from '../config/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

type NewsStatus = 'all' | 'published' | 'draft' | 'scheduled';

export default function NewsList() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<NewsStatus>('all');

  const isAdmin = user?.is_staff === true;

  useEffect(() => {
    loadNews();
  }, [language, statusFilter]);

  const loadNews = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await newsService.getNews(language);
      
      // Backend может возвращать либо массив, либо пагинированный объект
      let allNews: News[] = [];
      if (Array.isArray(response)) {
        // Если backend вернул массив напрямую
        allNews = response;
      } else if (response.results && Array.isArray(response.results)) {
        // Если backend вернул пагинированный объект
        allNews = response.results;
      } else {
        allNews = [];
      }
      
      // Для обычных пользователей показываем только опубликованные
      // Для адм��ов показываем все новости
      let filteredNews = allNews;
      if (!isAdmin) {
        filteredNews = allNews.filter(item => item.status === 'published');
      }
      
      // Применяем фильтр по статусу
      if (statusFilter !== 'all') {
        filteredNews = filteredNews.filter(item => item.status === statusFilter);
      }
      
      setNews(filteredNews);
    } catch (err: any) {
      setError(err.response?.status === 500 
        ? 'Ошибка сервера (500). Проверьте логи Django и конфигурацию API.' 
        : t('news.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await newsService.deleteNews(id);
      toast.success('Новость удалена');
      setNews(news.filter(n => n.id !== id));
    } catch (error) {
      toast.error('Не удалось удалить новость');
    } finally {
      setDeletingId(null);
    }
  };

  // Извлечь первое изображение из новости
  const getFirstImage = (item: News): string | null => {
    // 1. Сначала проверяем массив media
    if (item.media && item.media.length > 0) {
      const firstImageMedia = item.media.find(m => m.media_type === 'image');
      if (firstImageMedia?.file) {
        return getMediaUrl(firstImageMedia.file);
      }
    }
    
    // 2. Если в media нет, ищем в HTML контенте (TipTap сохраняет как <img src="...">)
    const body = getLocalizedField(item, 'body', language);
    if (!body) return null;
    
    // Создаем временный DOM элемент для парсинга HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = body;
    
    // Ищем первый <img> тег
    const firstImg = tempDiv.querySelector('img');
    if (firstImg?.src) {
      return getMediaUrl(firstImg.src);
    }
    
    return null;
  };

  // Форматировать дату (используем новую утилиту)
  const formatDate = (dateString: string): string => {
    return getLocalizedDate(dateString, language);
  };

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
          <div className="max-w-6xl mx-auto">
            <h1 className="mb-6">{t('news.title')}</h1>
            <div className="text-muted-foreground">{t('common.loading')}</div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="max-w-6xl mx-auto">
            <h1 className="mb-6">{t('news.title')}</h1>
            <Card className="p-6 border-destructive bg-destructive/10">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-destructive font-medium mb-2">{error}</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Backend не отвечает на запросы. Возможные причины:
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1 mb-4">
                    <li>Django сервер не запущен</li>
                    <li>Localtunnel не работает или слишком медленный</li>
                    <li>Endpoint /api/news/ недоступен</li>
                    <li>CORS блокирует запросы</li>
                  </ul>
                  <Button 
                    onClick={loadNews}
                    variant="outline"
                    size="sm"
                    disabled={loading}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Попробовать еще раз
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1>{t('news.title')}</h1>
            
            <div className="flex items-center gap-3">
              {/* Фильтр по статусу - только для админов */}
              {isAdmin && (
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as NewsStatus)}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Фильтр по статусу" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все новости</SelectItem>
                    <SelectItem value="published">Опубликованные</SelectItem>
                    <SelectItem value="draft">Черновики</SelectItem>
                    <SelectItem value="scheduled">Запланированные</SelectItem>
                  </SelectContent>
                </Select>
              )}
              
              {/* Кнопка создания новости */}
              {isAdmin && (
                <Button asChild>
                  <Link to="/news/create">
                    <FileText className="w-4 h-4 mr-2" />
                    Создать новость
                  </Link>
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {news.map((item) => {
              const firstImage = getFirstImage(item);
              // Получаем локализованные поля
              const title = getLocalizedField(item, 'title', language);
              const body = getLocalizedField(item, 'body', language);
              const excerpt = getExcerpt(body, 300);

              let imageUrl: string | null = null;
              if (firstImage) {
                // Используем утилиту getMediaUrl для обработки всех типов URL
                imageUrl = getMediaUrl(firstImage);
              }

              return (
                <div key={item.id}>
                  <Card className={`hover:shadow-lg transition-shadow overflow-hidden ${
                    item.is_no_news_found ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900' : ''
                  }`}>
                    <Link to={`/news/${item.id}`}>
                      <div className="flex flex-col md:flex-row">
                        {imageUrl && (
                          <div className="w-full md:w-80 flex-shrink-0 min-h-48 bg-white flex items-center justify-center p-4">
                            <ImageWithFallback
                              src={imageUrl}
                              alt={title}
                              className="max-w-full max-h-56 object-contain"
                            />
                          </div>
                        )}
                        <div className="flex-1 p-6">
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2 flex-1">
                              {item.is_no_news_found && (
                                <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
                              )}
                              <h3 className="flex-1">{title}</h3>
                            </div>
                            <div className="flex gap-2">
                              {item.is_no_news_found && (
                                <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">
                                  Не найдено
                                </Badge>
                              )}
                              {getStatusBadge(item)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground mb-3">
                            <Calendar className="w-4 h-4" />
                            <span className="text-sm">{formatDate(item.pub_date)}</span>
                          </div>
                          <p className="text-muted-foreground">{excerpt}</p>
                        </div>
                      </div>
                    </Link>
                    
                    {isAdmin && (
                      <div className="border-t border-border p-4 bg-muted/30">
                        <div className="flex items-center justify-between gap-4 mb-3">
                          {/* Индикатор автоматически созданной новости + source_url */}
                          {item.source_url && (
                            <div className="flex items-center gap-2 flex-1">
                              <Sparkles className="w-4 h-4 text-purple-500" />
                              <a
                                href={item.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Источник
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                          >
                            <Link to={`/news/edit/${item.id}`}>
                              <Edit className="w-4 h-4 mr-2" />
                              Редактировать
                            </Link>
                          </Button>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={deletingId === item.id}
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
                                  onClick={() => handleDelete(item.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Удалить
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
              );
            })}
          </div>

          {news.length === 0 && !loading && !error && (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                {t('news.notFound')}
              </p>
              {isAdmin && (
                <Button asChild>
                  <Link to="/news/create">
                    <FileText className="w-4 h-4 mr-2" />
                    Создать первую новость
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}