import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useHvacAuth as useAuth } from '../hooks/useHvacAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Settings, Plus, Edit, Copy, Trash2, CheckCircle2,
  Loader2, Star, Play, BarChart3,
} from 'lucide-react';
import ratingService, {
  RatingConfiguration,
  RatingConfigListItem,
  RatingRunListItem,
  RatingStats,
  RatingProgress,
} from '../services/ratingService';
import { toast } from 'sonner';
import ApiErrorBanner from '../components/ApiErrorBanner';
import { RatingConfigFormDialog } from '../components/rating-config';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PROVIDER_COLORS: Record<string, string> = {
  grok: 'bg-purple-100 text-purple-800',
  anthropic: 'bg-orange-100 text-orange-800',
  gemini: 'bg-blue-100 text-blue-800',
  openai: 'bg-green-100 text-green-800',
};

export default function RatingSettingsPage() {
  const { user } = useAuth();
  const [activeConfig, setActiveConfig] = useState<RatingConfiguration | null>(null);
  const [configurations, setConfigurations] = useState<RatingConfigListItem[]>([]);
  const [recentRuns, setRecentRuns] = useState<RatingRunListItem[]>([]);
  const [stats, setStats] = useState<RatingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rating, setRating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<RatingConfiguration | null>(null);
  const [progress, setProgress] = useState<RatingProgress | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAdmin = user?.is_staff === true;

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const p = await ratingService.getRatingProgress();
        setProgress(p);
        if (p.status !== 'running') {
          stopPolling();
          setRating(false);
          loadData();
        }
      } catch { /* ignore */ }
    }, 2000);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    if (isAdmin) loadData();
  }, [isAdmin]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [active, list, runs, statsData] = await Promise.all([
        ratingService.getActiveConfiguration().catch(() => null),
        ratingService.getConfigurations(),
        ratingService.getRatingRuns().catch(() => []),
        ratingService.getRatingStats().catch(() => null),
      ]);
      setActiveConfig(active);
      setConfigurations(list);
      setRecentRuns(runs.slice(0, 10));
      setStats(statsData);

      // Проверяем, не идёт ли сейчас рейтинг
      try {
        const p = await ratingService.getRatingProgress();
        setProgress(p);
        if (p.status === 'running') {
          setRating(true);
          startPolling();
        }
      } catch { /* ignore */ }
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (id: number) => {
    try {
      await ratingService.activateConfiguration(id);
      toast.success('Конфигурация активирована');
      loadData();
    } catch { toast.error('Ошибка активации'); }
  };

  const handleDuplicate = async (id: number) => {
    try {
      await ratingService.duplicateConfiguration(id);
      toast.success('Конфигурация дублирована');
      loadData();
    } catch { toast.error('Ошибка дублирования'); }
  };

  const handleDelete = async () => {
    if (!configToDelete) return;
    try {
      setDeleting(true);
      await ratingService.deleteConfiguration(configToDelete);
      toast.success('Конфигурация удалена');
      loadData();
    } catch { toast.error('Ошибка удаления'); }
    finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setConfigToDelete(null);
    }
  };

  const handleRateAll = async () => {
    try {
      setRating(true);
      setProgress(null);
      const result = await ratingService.rateAllUnrated();
      toast.success(result.message || 'AI-рейтинг запущен');
      startPolling();
    } catch {
      toast.error('Ошибка запуска рейтинга');
      setRating(false);
    }
  };

  const handleAnalyze = async () => {
    try {
      setAnalyzing(true);
      const result = await ratingService.analyzePublished();
      toast.success(result.message || 'Анализ опубликованных запущен');
    } catch { toast.error('Ошибка запуска анализа'); }
    finally { setAnalyzing(false); }
  };

  const handleCreate = () => {
    setSelectedConfig(null);
    setFormDialogOpen(true);
  };

  const handleEdit = async (id: number) => {
    try {
      const config = await ratingService.getConfiguration(id);
      setSelectedConfig(config);
      setFormDialogOpen(true);
    } catch { toast.error('Ошибка загрузки конфигурации'); }
  };

  if (!isAdmin) {
    return <div className="p-6 text-center text-muted-foreground">Доступ только для администраторов</div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (error) {
    return <ApiErrorBanner error={error} onRetry={loadData} />;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="h-6 w-6" /> Настройки AI-рейтинга
          </h1>
          <p className="text-muted-foreground mt-1">
            Конфигурация автоматической оценки новостей
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Создать конфигурацию
          </Button>
          <Button variant="outline" onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
            Анализ опубликованных
          </Button>
          <Button variant="outline" onClick={handleRateAll} disabled={rating}>
            {rating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Оценить все неоценённые
          </Button>
        </div>
      </div>

      {/* Статистика */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Запусков рейтинга</div>
            <div className="text-2xl font-bold">{stats.total_runs}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Новостей оценено</div>
            <div className="text-2xl font-bold">{stats.total_news_rated}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Стоимость</div>
            <div className="text-2xl font-bold">${Number(stats.total_cost_usd).toFixed(2)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">API запросов</div>
            <div className="text-2xl font-bold">{stats.total_requests}</div>
          </Card>
        </div>
      )}

      {/* Прогресс рейтинга */}
      {(rating || (progress && progress.status === 'running')) && (
        <Card className="p-4 border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <span className="font-semibold text-blue-800 dark:text-blue-200">
              AI-рейтинг выполняется...
            </span>
            {progress?.current_phase && (
              <Badge variant="outline">{progress.current_phase}</Badge>
            )}
          </div>
          {progress && progress.total_to_rate > 0 && (
            <>
              <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-3 mb-2">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((progress.processed_count / progress.total_to_rate) * 100))}%` }}
                />
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{progress.processed_count} / {progress.total_to_rate} новостей</span>
                <span>{Math.round((progress.processed_count / progress.total_to_rate) * 100)}%</span>
                {progress.estimated_cost_usd > 0 && (
                  <span>${progress.estimated_cost_usd.toFixed(4)}</span>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      {/* Результат последнего рейтинга */}
      {progress && progress.status === 'completed' && progress.rating_distribution && Object.keys(progress.rating_distribution).length > 0 && (
        <Card className="p-4 border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="font-semibold text-green-800 dark:text-green-200">
              Рейтинг завершён: {progress.total_news_rated} новостей оценено
            </span>
          </div>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(progress.rating_distribution)
              .sort(([a], [b]) => Number(b) - Number(a))
              .map(([stars, count]) => (
                <Badge key={stars} variant="secondary">
                  {Number(stars) > 0 ? '★'.repeat(Number(stars)) : '○'} {stars}: {count}
                </Badge>
              ))}
          </div>
        </Card>
      )}

      {/* Ошибка рейтинга */}
      {progress && progress.status === 'error' && (
        <Card className="p-4 border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20">
          <div className="flex items-center gap-3">
            <Star className="h-5 w-5 text-red-600" />
            <span className="font-semibold text-red-800 dark:text-red-200">
              Ошибка: {progress.error_message || 'Неизвестная ошибка'}
            </span>
          </div>
        </Card>
      )}

      {/* Активная конфигурация */}
      {activeConfig && (
        <Card className="p-4 border-primary/50 bg-primary/5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span className="font-semibold">Активная: {activeConfig.name}</span>
                <Badge className={PROVIDER_COLORS[activeConfig.primary_provider] || ''}>
                  {activeConfig.primary_provider}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Батч: {activeConfig.batch_size} | Температура: {activeConfig.temperature} |
                Порог дубликатов: {activeConfig.duplicate_similarity_threshold}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Таблица конфигураций */}
      <Card>
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings className="h-5 w-5" /> Конфигурации
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Имя</TableHead>
              <TableHead>Провайдер</TableHead>
              <TableHead>Батч</TableHead>
              <TableHead>Температура</TableHead>
              <TableHead>Обновлено</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configurations.map((config) => (
              <TableRow key={config.id} className={config.is_active ? 'bg-primary/5' : ''}>
                <TableCell className="font-medium">
                  {config.name}
                  {config.is_active && <Badge variant="outline" className="ml-2">active</Badge>}
                </TableCell>
                <TableCell>
                  <Badge className={PROVIDER_COLORS[config.primary_provider] || ''}>
                    {config.primary_provider}
                  </Badge>
                </TableCell>
                <TableCell>{config.batch_size}</TableCell>
                <TableCell>{config.temperature}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(config.updated_at).toLocaleDateString('ru-RU')}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(config.id)} title="Редактировать">
                    <Edit className="h-4 w-4" />
                  </Button>
                  {!config.is_active && (
                    <Button variant="ghost" size="sm" onClick={() => handleActivate(config.id)} title="Активировать">
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleDuplicate(config.id)} title="Дублировать">
                    <Copy className="h-4 w-4" />
                  </Button>
                  {!config.is_active && (
                    <Button variant="ghost" size="sm" onClick={() => {
                      setConfigToDelete(config.id);
                      setDeleteConfirmOpen(true);
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Последние запуски */}
      {recentRuns.length > 0 && (
        <Card>
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5" /> Последние запуски
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Оценено</TableHead>
                <TableHead>Дубликатов</TableHead>
                <TableHead>Стоимость</TableHead>
                <TableHead>Длительность</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentRuns.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="text-sm">
                    {new Date(run.created_at).toLocaleString('ru-RU')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={run.status === 'completed' ? 'default' : run.status === 'error' ? 'destructive' : 'secondary'}>
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{run.total_news_rated}</TableCell>
                  <TableCell>{run.duplicates_found}</TableCell>
                  <TableCell>${Number(run.estimated_cost_usd).toFixed(4)}</TableCell>
                  <TableCell>{run.duration_display}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Диалог подтверждения удаления */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить конфигурацию?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие необратимо. Конфигурация будет удалена навсегда.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Диалог создания/редактирования конфигурации */}
      <RatingConfigFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        config={selectedConfig}
        onSuccess={() => {
          setFormDialogOpen(false);
          setSelectedConfig(null);
          loadData();
        }}
      />
    </div>
  );
}
