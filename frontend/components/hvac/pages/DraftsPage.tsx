import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from '@/hooks/erp-router';
import { useHvacAuth as useAuth } from '../hooks/useHvacAuth';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import newsService, { News } from '../services/newsService';
import referencesService from '../services/referencesService';
import { toast } from 'sonner';
import { Edit, Trash2, Send, FileText, RefreshCw, Clock, Sparkles, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';

import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { stripHtml, extractFirstImageFromHtml } from '../utils/htmlHelpers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Progress } from '../components/ui/progress';

export default function DraftsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  
  const [drafts, setDrafts] = useState<News[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  
  // Состояния для автообновления
  const [isSearchRunning, setIsSearchRunning] = useState(false);
  const [searchStartTime, setSearchStartTime] = useState<Date | null>(null);
  const [newNewsCount, setNewNewsCount] = useState(0);
  const [searchProgress, setSearchProgress] = useState({ processed: 0, total: 0, percent: 0, created: 0 });
  const [searchType, setSearchType] = useState<'resources' | 'manufacturers' | 'both' | null>(null);
  const autoRefreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Состояния для фильтров
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'last_hour' | 'last_24h'>('all');
  const [showAutoUpdate, setShowAutoUpdate] = useState(false);

  useEffect(() => {
    if (!user?.is_staff) {
      toast.error('У вас нет прав для доступа к этой странице');
      navigate('/');
      return;
    }
    loadDrafts();
    checkSearchStatus();
  }, [user, navigate]);

  // Очистка интервала при размонтировании
  useEffect(() => {
    return () => {
      if (autoRefreshInterval.current) {
        clearInterval(autoRefreshInterval.current);
      }
    };
  }, []);

  // Запуск автообновления при активном поиске
  useEffect(() => {
    if (isSearchRunning && !autoRefreshInterval.current) {
      startAutoRefresh();
    } else if (!isSearchRunning && autoRefreshInterval.current) {
      stopAutoRefresh();
    }
  }, [isSearchRunning]);

  const loadDrafts = async (params?: { created_at__gte?: string }) => {
    try {
      const filterParams = {
        ...params,
        ordering: '-created_at'
      };
      const data = await newsService.getDraftsFiltered(filterParams);
      setDrafts(data);
      
      // Подсчитываем новые новости
      if (searchStartTime && params?.created_at__gte) {
        const newNews = data.filter(d => new Date(d.created_at!) >= searchStartTime);
        setNewNewsCount(newNews.length);
      }
    } catch (error) {
      console.error('Failed to load drafts:', error);
      toast.error('Не удалось загрузить черновики');
    } finally {
      setIsLoading(false);
    }
  };

  const checkSearchStatus = async () => {
    try {
      // Проверяем статус поиска по источникам
      const resourcesStatus = await referencesService.getNewsDiscoveryStatus();
      // Проверяем статус поиска по производителям
      const manufacturersStatus = await referencesService.getManufacturerNewsDiscoveryStatus();
      
      const isResourcesRunning = resourcesStatus.status === 'running';
      const isManufacturersRunning = manufacturersStatus.status === 'running';
      
      if (isResourcesRunning || isManufacturersRunning) {
        setIsSearchRunning(true);
        setShowAutoUpdate(true);
        
        // Определяем тип поиска
        if (isResourcesRunning && isManufacturersRunning) {
          setSearchType('both');
          // Суммируем прогресс
          setSearchProgress({
            processed: resourcesStatus.processed + manufacturersStatus.processed,
            total: resourcesStatus.total + manufacturersStatus.total,
            percent: Math.round(((resourcesStatus.processed + manufacturersStatus.processed) / (resourcesStatus.total + manufacturersStatus.total)) * 100),
            created: (resourcesStatus.created || 0) + (manufacturersStatus.created || 0)
          });
        } else if (isResourcesRunning) {
          setSearchType('resources');
          setSearchProgress({
            processed: resourcesStatus.processed,
            total: resourcesStatus.total,
            percent: resourcesStatus.percent,
            created: resourcesStatus.created || 0
          });
        } else if (isManufacturersRunning) {
          setSearchType('manufacturers');
          setSearchProgress({
            processed: manufacturersStatus.processed,
            total: manufacturersStatus.total,
            percent: manufacturersStatus.percent,
            created: manufacturersStatus.created || 0
          });
        }
        
        // Устанавливаем время начала поиска, если еще не установлено
        if (!searchStartTime) {
          setSearchStartTime(new Date());
        }
      } else {
        setIsSearchRunning(false);
        if (searchStartTime) {
          // Поиск завершен - показываем уведомление
          toast.success(`Поиск новостей завершен! Найдено новостей: ${searchProgress.created}`);
        }
      }
    } catch (error) {
      console.error('Failed to check search status:', error);
    }
  };

  const startAutoRefresh = () => {
    console.log('🔄 Запуск автообновления черновиков');
    
    autoRefreshInterval.current = setInterval(async () => {
      try {
        // Проверяем статус поиска
        await checkSearchStatus();
        
        // Загружаем черновики с фильтром по времени начала поиска
        if (searchStartTime) {
          await loadDrafts({
            created_at__gte: searchStartTime.toISOString()
          });
        } else {
          await loadDrafts();
        }
      } catch (error) {
        console.error('Auto-refresh error:', error);
      }
    }, 5000); // Каждые 5 секунд
  };

  const stopAutoRefresh = () => {
    console.log('⏹️ Остановка автообновления черновиков');
    if (autoRefreshInterval.current) {
      clearInterval(autoRefreshInterval.current);
      autoRefreshInterval.current = null;
    }
  };

  const handleManualRefresh = async () => {
    setIsLoading(true);
    await loadDrafts(searchStartTime ? { created_at__gte: searchStartTime.toISOString() } : undefined);
    await checkSearchStatus();
  };

  const handleCloseAutoUpdate = () => {
    setShowAutoUpdate(false);
    setSearchStartTime(null);
    setNewNewsCount(0);
    loadDrafts(); // Перезагружаем все черновики
  };

  const handleDateFilterChange = (value: string) => {
    setDateFilter(value as any);
    
    let filterDate: string | undefined;
    const now = new Date();
    
    switch (value) {
      case 'today':
        filterDate = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        break;
      case 'last_hour':
        filterDate = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
        break;
      case 'last_24h':
        filterDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        break;
      default:
        filterDate = undefined;
    }
    
    loadDrafts(filterDate ? { created_at__gte: filterDate } : undefined);
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await newsService.deleteNews(id);
      toast.success('Черновик удален');
      setDrafts(drafts.filter(d => d.id !== id));
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } catch (error) {
      console.error('Failed to delete draft:', error);
      toast.error('Не удалось удалить черновик');
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    
    setIsBulkDeleting(true);
    try {
      await newsService.bulkDeleteNews(selectedIds);
      toast.success(`Удалено ${selectedIds.length} ${selectedIds.length === 1 ? 'черновик' : 'черновиков'}`);
      setDrafts(drafts.filter(d => !selectedIds.includes(d.id)));
      setSelectedIds([]);
      setShowBulkDeleteDialog(false);
    } catch (error) {
      console.error('Failed to bulk delete drafts:', error);
      toast.error('Не удалось удалить черновики');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handlePublish = async (id: number) => {
    setPublishingId(id);
    try {
      await newsService.publishNews(id);
      toast.success('Новость опубликована');
      setDrafts(drafts.filter(d => d.id !== id));
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } catch (error) {
      console.error('Failed to publish news:', error);
      toast.error('Не удалось опубликовать новость');
    } finally {
      setPublishingId(null);
    }
  };

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === drafts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(drafts.map(d => d.id));
    }
  };

  const isNewNews = (draft: News): boolean => {
    if (!searchStartTime || !draft.created_at) return false;
    return new Date(draft.created_at) >= searchStartTime;
  };

  const getSearchTypeLabel = () => {
    switch (searchType) {
      case 'resources':
        return 'по источникам';
      case 'manufacturers':
        return 'по производителям';
      case 'both':
        return 'по источникам и производителям';
      default:
        return '';
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="container max-w-6xl mx-auto py-8 px-4">
        {/* Баннер автообновления */}
        {showAutoUpdate && (
          <Card className="mb-6 border-blue-200 bg-blue-50/50">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {isSearchRunning ? (
                    <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5 text-blue-600" />
                  )}
                  <div>
                    <h3 className="font-semibold text-blue-900">
                      {isSearchRunning ? `Идет поиск новостей ${getSearchTypeLabel()}...` : 'Поиск новостей завершен'}
                    </h3>
                    <p className="text-sm text-blue-700 mt-1">
                      {isSearchRunning 
                        ? `Обработано: ${searchProgress.processed} из ${searchProgress.total} • Найдено: ${searchProgress.created} новостей`
                        : `Найдено ${newNewsCount} новых черновиков`
                      }
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManualRefresh}
                    disabled={isLoading}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                    Обновить
                  </Button>
                  {!isSearchRunning && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCloseAutoUpdate}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
              
              {isSearchRunning && (
                <div className="space-y-2">
                  <Progress value={searchProgress.percent} className="h-2" />
                  <p className="text-xs text-blue-600 text-right">{searchProgress.percent}%</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Заголовок и действия */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1>Черновики</h1>
            <p className="text-muted-foreground mt-1">
              {drafts.length} {drafts.length === 1 ? 'черновик' : 'черновиков'}
              {selectedIds.length > 0 && ` • Выбрано: ${selectedIds.length}`}
              {newNewsCount > 0 && ` • Новых: ${newNewsCount}`}
            </p>
          </div>
          <div className="flex gap-2">
            {selectedIds.length > 0 && (
              <Button 
                variant="destructive" 
                onClick={() => setShowBulkDeleteDialog(true)}
                disabled={isBulkDeleting}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Удалить выбранные ({selectedIds.length})
              </Button>
            )}
            <Button asChild>
              <Link to="/hvac/news/create">
                <FileText className="w-4 h-4 mr-2" />
                Создать новость
              </Link>
            </Button>
          </div>
        </div>

        {/* Фильтры */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <Select value={dateFilter} onValueChange={handleDateFilterChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Фильтр по дате" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все черновики</SelectItem>
                <SelectItem value="today">Сегодня</SelectItem>
                <SelectItem value="last_hour">Последний час</SelectItem>
                <SelectItem value="last_24h">Последние 24 часа</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {drafts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="mb-2">Нет черновиков</h3>
              <p className="text-muted-foreground mb-6">
                {dateFilter !== 'all' 
                  ? 'Попробуйте изменить фильтр или создайте новую новость'
                  : 'Создайте новую новость, чтобы она появилась здесь'
                }
              </p>
              <Button asChild>
                <Link to="/hvac/news/create">Создать новость</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Шапка с "Выбрать все" */}
            <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-lg">
              <Checkbox
                id="select-all"
                checked={selectedIds.length === drafts.length}
                onCheckedChange={toggleSelectAll}
              />
              <label 
                htmlFor="select-all" 
                className="text-sm font-medium cursor-pointer select-none"
              >
                Выбрать все
              </label>
            </div>

            <div className="grid gap-4">
              {drafts.map((draft) => {
                const imageUrl = extractFirstImageFromHtml(draft.body);
                const isSelected = selectedIds.includes(draft.id);
                const isNew = isNewNews(draft);
                
                return (
                  <Card 
                    key={draft.id} 
                    className={`hover:shadow-lg transition-all overflow-hidden ${
                      isSelected ? 'ring-2 ring-primary' : ''
                    } ${isNew ? 'border-blue-300 bg-blue-50/30' : ''}`}
                  >
                    <div className="flex flex-col md:flex-row">
                      {/* Чекбокс слева */}
                      <div className="flex items-center justify-center p-4 md:p-6">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelection(draft.id)}
                          className="h-5 w-5"
                        />
                      </div>

                      {imageUrl && (
                        <div className="w-full md:w-80 flex-shrink-0 h-52 md:h-56 bg-white grid place-items-center p-4">
                          <ImageWithFallback
                            src={imageUrl}
                            alt={draft.title}
                            style={{ 
                              maxWidth: '100%', 
                              maxHeight: '100%',
                              objectFit: 'contain'
                            }}
                          />
                        </div>
                      )}
                      <div className="flex-1 flex flex-col">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <CardTitle className="text-xl">{draft.title}</CardTitle>
                                <Badge variant="secondary">Черновик</Badge>
                                {isNew && (
                                  <Badge variant="default" className="bg-blue-600">
                                    <Sparkles className="w-3 h-3 mr-1" />
                                    Новое
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Создано: {new Date(draft.created_at!).toLocaleDateString('ru-RU', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-muted-foreground line-clamp-3">
                            {stripHtml(draft.body)}
                          </p>
                        </CardContent>
                        <CardFooter className="flex gap-2 mt-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                          >
                            <Link to={`/hvac/news/edit/${draft.id}`}>
                              <Edit className="w-4 h-4 mr-2" />
                              Редактировать
                            </Link>
                          </Button>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={publishingId === draft.id}
                              >
                                <Send className="w-4 h-4 mr-2" />
                                Опубликовать
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Опубликовать новость?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Новость будет опубликована и станет доступна всем пользователям.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Отмена</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handlePublish(draft.id)}>
                                  Опубликовать
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={deletingId === draft.id}
                                className="ml-auto"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Удалить
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Удалить черновик?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Это действие нельзя отменить. Черновик будет удален навсегда.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Отмена</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => handleDelete(draft.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Удалить
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </CardFooter>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {/* Диалог массового удаления */}
        <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить выбранные черновики?</AlertDialogTitle>
              <AlertDialogDescription>
                Вы собираетесь удалить {selectedIds.length} {selectedIds.length === 1 ? 'черновик' : 'черновиков'}. 
                Это действие нельзя отменить.
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
      </div>
    </>
  );
}