import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from '@/hooks/erp-router';
import { useHvacLanguage as useLanguage } from '../hooks/useHvacLanguage';
import { useHvacAuth as useAuth } from '../hooks/useHvacAuth';
import newsService, { News } from '../services/newsService';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, AlertCircle, RefreshCw, Edit, Trash2, FileText, ExternalLink, Sparkles, AlertTriangle, Star, ChevronDown, ChevronRight } from 'lucide-react';
import ratingService from '../services/ratingService';
import { Checkbox } from '@/components/ui/checkbox';
import { ImageWithFallback } from '@/components/common/ImageWithFallback';

import { useTranslation } from 'react-i18next';
import { getLocalizedField, getLocalizedDate } from '../utils/i18nHelpers';
import { getExcerpt } from '../utils/htmlHelpers';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { getMediaUrl, getServerBaseUrl } from '../config/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type NewsStatus = 'all' | 'published' | 'draft' | 'scheduled';

export default function NewsList() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<NewsStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [starFilter, setStarFilter] = useState<number[]>([]);

  const isAdmin = user?.is_staff === true;

  const toggleStarFilter = (star: number) => {
    setStarFilter(prev =>
      prev.includes(star) ? prev.filter(s => s !== star) : [...prev, star]
    );
  };

  const [editingRatingId, setEditingRatingId] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());

  const toggleGroup = (star: number) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(star)) next.delete(star);
      else next.add(star);
      return next;
    });
  };

  const handleSetRating = async (newsId: number, rating: number) => {
    try {
      await ratingService.setRating(newsId, rating);
      setNews(prev => prev.map(n =>
        n.id === newsId ? { ...n, star_rating: rating } as News : n
      ));
      setEditingRatingId(null);
      toast.success(`Рейтинг установлен: ${rating}★`);
    } catch {
      toast.error('Ошибка установки рейтинга');
    }
  };

  const getStarBadge = (item: News) => {
    const rating = (item as News & { star_rating?: number | null }).star_rating;
    if (rating === null || rating === undefined) return null;
    const colors: Record<number, string> = {
      0: 'bg-gray-100 text-gray-600',
      1: 'bg-red-100 text-red-700',
      2: 'bg-orange-100 text-orange-700',
      3: 'bg-yellow-100 text-yellow-700',
      4: 'bg-blue-100 text-blue-700',
      5: 'bg-green-100 text-green-700',
    };
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setEditingRatingId(editingRatingId === item.id ? null : item.id); }}
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:ring-2 ring-primary/30 ${colors[rating] || ''}`}
        title="Нажмите для изменения рейтинга"
      >
        {'★'.repeat(rating || 0)}{rating === 0 ? '○' : ''} {rating}
      </button>
    );
  };

  const renderInlineRatingEditor = (item: News) => {
    if (editingRatingId !== item.id) return null;
    return (
      <div className="flex items-center gap-1 mt-1">
        {[0, 1, 2, 3, 4, 5].map(r => (
          <button
            key={r}
            onClick={() => handleSetRating(item.id, r)}
            className="px-2 py-0.5 rounded text-xs border hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            {r > 0 ? '★'.repeat(r) : '○'}
          </button>
        ))}
        <button onClick={() => setEditingRatingId(null)} className="text-xs text-muted-foreground ml-1">✕</button>
      </div>
    );
  };

  // Группировка новостей по рейтингу (для черновиков)
  const getGroupedNews = () => {
    if (statusFilter !== 'draft') return null;
    const groups: Record<number, News[]> = {};
    for (const item of news) {
      const rating = (item as News & { star_rating?: number | null }).star_rating ?? -1;
      if (!groups[rating]) groups[rating] = [];
      groups[rating].push(item);
    }
    return groups;
  };

  useEffect(() => {
    setNews([]);
    setCurrentPage(1);
    setSelectedIds([]);
    loadNews(1, true);
  }, [language, statusFilter, starFilter]);

  const loadNews = async (page: number = 1, reset: boolean = false) => {
    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      const response = await newsService.getNews(language, page, starFilter);

      let pageNews: News[] = [];
      let nextPage: string | null = null;
      if (Array.isArray(response)) {
        pageNews = response;
      } else if (response.results && Array.isArray(response.results)) {
        pageNews = response.results;
        nextPage = response.next;
      }

      if (!isAdmin) {
        pageNews = pageNews.filter(item => item.status === 'published');
      }
      if (statusFilter !== 'all') {
        pageNews = pageNews.filter(item => item.status === statusFilter);
      }

      setNews(prev => reset ? pageNews : [...prev, ...pageNews]);
      setHasMore(!!nextPage);
      setCurrentPage(page);
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      setError(status === 500
        ? 'Ошибка сервера (500). Проверьте логи Django и конфигурацию API.'
        : t('news.loadError'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    loadNews(currentPage + 1, false);
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await newsService.deleteNews(id);
      toast.success('Новость удалена');
      setNews(news.filter(n => n.id !== id));
      setSelectedIds(prev => prev.filter(sid => sid !== id));
    } catch (error) {
      toast.error('Не удалось удалить новость');
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setIsBulkDeleting(true);
    try {
      await newsService.bulkDeleteNews(selectedIds);
      toast.success(`Удалено: ${selectedIds.length}`);
      setNews(prev => prev.filter(n => !selectedIds.includes(n.id)));
      setSelectedIds([]);
      setShowBulkDeleteDialog(false);
    } catch {
      toast.error('Не удалось удалить новости');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleSelection = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev =>
      prev.length === news.length ? [] : news.map(n => n.id)
    );
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
      <>
        <div className="p-6">
          <div className="max-w-6xl mx-auto">
            <h1 className="mb-6">{t('news.title')}</h1>
            <div className="text-muted-foreground">{t('common.loading')}</div>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
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
                    onClick={() => loadNews()}
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
      </>
    );
  }

  return (
    <>
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1>{t('news.title')}</h1>
            
            <div className="flex items-center gap-3">
              {/* Кнопка массового удаления */}
              {isAdmin && selectedIds.length > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => setShowBulkDeleteDialog(true)}
                  disabled={isBulkDeleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Удалить выбранные ({selectedIds.length})
                </Button>
              )}

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
                  <Link to="/hvac/news/create">
                    <FileText className="w-4 h-4 mr-2" />
                    Создать новость
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {/* Фильтр по рейтингу — только для админов */}
          {isAdmin && (
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground mr-1">Рейтинг:</span>
              {[5, 4, 3, 2, 1, 0].map(star => (
                <button
                  key={star}
                  onClick={() => toggleStarFilter(star)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    starFilter.includes(star)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-accent'
                  }`}
                >
                  {star > 0 ? '★'.repeat(star) : '○'} {star}
                </button>
              ))}
              {starFilter.length > 0 && (
                <button
                  onClick={() => setStarFilter([])}
                  className="text-xs text-muted-foreground hover:text-foreground underline ml-2"
                >
                  Сбросить
                </button>
              )}
            </div>
          )}

          {/* Шапка "Выбрать все" — только для админов */}
          {isAdmin && news.length > 0 && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-lg">
              <Checkbox
                id="select-all"
                checked={news.length > 0 && selectedIds.length === news.length}
                onCheckedChange={toggleSelectAll}
              />
              <label
                htmlFor="select-all"
                className="text-sm font-medium cursor-pointer select-none"
              >
                Выбрать все
              </label>
              {selectedIds.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  (выбрано: {selectedIds.length})
                </span>
              )}
            </div>
          )}

          {/* Рендер карточек новостей */}
          {(() => {
            // Функция рендера одной карточки
            const renderNewsCard = (item: News) => {
              const firstImage = getFirstImage(item);
              const title = getLocalizedField(item, 'title', language);
              const body = getLocalizedField(item, 'body', language);
              const excerpt = getExcerpt(body, 300);
              let imageUrl: string | null = null;
              if (firstImage) imageUrl = getMediaUrl(firstImage);
              const isSelected = selectedIds.includes(item.id);

              return (
                <div key={item.id}>
                  <Card className={`hover:shadow-lg transition-all overflow-hidden ${
                    item.is_no_news_found ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900' : ''
                  } ${isSelected ? 'ring-2 ring-primary' : ''}`}>
                    <div className="flex flex-col md:flex-row">
                      {isAdmin && (
                        <div className="flex items-center justify-center p-4 md:p-6 flex-shrink-0">
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleSelection(item.id)} className="h-5 w-5" />
                        </div>
                      )}
                      <Link to={`/hvac/news/edit/${item.id}`} className="flex flex-col md:flex-row flex-1 min-w-0">
                        {imageUrl && (
                          <div className="w-full md:w-80 flex-shrink-0 min-h-48 bg-white flex items-center justify-center p-4">
                            <ImageWithFallback src={imageUrl} alt={title} className="max-w-full max-h-56 object-contain" />
                          </div>
                        )}
                        <div className="flex-1 p-6">
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2 flex-1">
                              {item.is_no_news_found && <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />}
                              <h3 className="flex-1">{title}</h3>
                            </div>
                            <div className="flex gap-2">
                              {item.is_no_news_found && (
                                <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">Не найдено</Badge>
                              )}
                              {getStatusBadge(item)}
                              {getStarBadge(item)}
                            </div>
                            {isAdmin && renderInlineRatingEditor(item)}
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground mb-3">
                            <Calendar className="w-4 h-4" />
                            <span className="text-sm">{formatDate(item.pub_date)}</span>
                          </div>
                          <p className="text-muted-foreground">{excerpt}</p>
                        </div>
                      </Link>
                    </div>
                    {isAdmin && (
                      <div className="border-t border-border p-4 bg-muted/30">
                        <div className="flex items-center justify-between gap-4 mb-3">
                          {item.source_url && (
                            <div className="flex items-center gap-2 flex-1">
                              <Sparkles className="w-4 h-4 text-purple-500" />
                              <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                                className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 underline"
                                onClick={(e) => e.stopPropagation()}>
                                Источник <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/hvac/news/edit/${item.id}`}><Edit className="w-4 h-4 mr-2" />Редактировать</Link>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" disabled={deletingId === item.id}>
                                <Trash2 className="w-4 h-4 mr-2" />Удалить
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Удалить новость?</AlertDialogTitle>
                                <AlertDialogDescription>Это действие нельзя отменить. Новость будет удалена навсегда.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Отмена</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(item.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Удалить</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
              );
            };

            // Группированный вид для черновиков
            const grouped = getGroupedNews();
            if (grouped && isAdmin) {
              const STAR_LABELS: Record<number, string> = {
                5: '5★ Интересно', 4: '4★ Ограниченно интересно', 3: '3★ Не интересно',
                2: '2★ Не по теме', 1: '1★ Не найдено', 0: '0★ Не классифицировано', [-1]: 'Без рейтинга',
              };
              const GROUP_COLORS: Record<number, string> = {
                5: 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20',
                4: 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20',
                3: 'border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20',
                2: 'border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20',
                1: 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20',
                0: 'border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-950/20',
                [-1]: 'border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-950/20',
              };
              const sortedKeys = Object.keys(grouped).map(Number).sort((a, b) => b - a);

              return (
                <div className="space-y-4">
                  {sortedKeys.map(star => {
                    const groupItems = grouped[star];
                    const isCollapsed = collapsedGroups.has(star);
                    const groupIds = groupItems.map(n => n.id);
                    const label = STAR_LABELS[star] || `${star}★`;

                    return (
                      <div key={star} className={`rounded-lg border ${GROUP_COLORS[star] || ''}`}>
                        <div
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/30 rounded-t-lg"
                          onClick={() => toggleGroup(star)}
                        >
                          <div className="flex items-center gap-2">
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            <span className="font-semibold">{label}</span>
                            <Badge variant="secondary">{groupItems.length}</Badge>
                          </div>
                          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            {star >= 4 && (
                              <Button variant="outline" size="sm" onClick={() => {
                                // Batch publish: добавляем все ID группы к выбранным
                                setSelectedIds(prev => [...new Set([...prev, ...groupIds])]);
                                toast.success(`Выбрано ${groupIds.length} новостей для публикации`);
                              }}>
                                Выбрать все
                              </Button>
                            )}
                            {star <= 1 && (
                              <Button variant="outline" size="sm" className="text-destructive" onClick={() => {
                                setSelectedIds(prev => [...new Set([...prev, ...groupIds])]);
                                setShowBulkDeleteDialog(true);
                              }}>
                                <Trash2 className="w-3 h-3 mr-1" />Удалить группу
                              </Button>
                            )}
                          </div>
                        </div>
                        {!isCollapsed && (
                          <div className="space-y-3 p-3 pt-0">
                            {groupItems.map(renderNewsCard)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }

            // Обычный вид (не черновики)
            return (
              <div className="space-y-4">
                {news.map(renderNewsCard)}
              </div>
            );
          })()}

          {hasMore && (
            <div className="flex justify-center py-8">
              <Button
                variant="outline"
                size="lg"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Загрузка...</>
                ) : (
                  'Показать ещё'
                )}
              </Button>
            </div>
          )}

          {news.length === 0 && !loading && !error && (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                {t('news.notFound')}
              </p>
              {isAdmin && (
                <Button asChild>
                  <Link to="/hvac/news/create">
                    <FileText className="w-4 h-4 mr-2" />
                    Создать первую новость
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Диалог массового удаления */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить выбранные новости?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет удалено: {selectedIds.length}. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}