import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Calendar, AlertCircle, Sparkles, Clock, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import referencesService, { Resource } from '../services/referencesService';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import ProviderSelection from './ProviderSelection';
import { toast } from 'sonner';

interface ResourcesGlobalDiscoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resources: Resource[];
  onComplete?: () => void;
}

interface SearchProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  currentResource: string | null;
}

export default function ResourcesGlobalDiscoveryDialog({
  open,
  onOpenChange,
  resources,
  onComplete,
}: ResourcesGlobalDiscoveryDialogProps) {
  const [selectedProvider, setSelectedProvider] = useState<string>('auto');
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState<SearchProgress>({
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    currentResource: null,
  });
  const [searchStartTime, setSearchStartTime] = useState<Date | null>(null);

  // Отфильтруем только источники с типом auto или hybrid
  const searchableResources = resources.filter(
    (r) => r.source_type === 'auto' || r.source_type === 'hybrid'
  );

  const handleStartSearch = async () => {
    if (searchableResources.length === 0) {
      toast.error('Нет доступных источников для поиска');
      return;
    }

    setIsSearching(true);
    setSearchStartTime(new Date());
    setSearchProgress({
      total: searchableResources.length,
      processed: 0,
      successful: 0,
      failed: 0,
      currentResource: null,
    });

    let successful = 0;
    let failed = 0;

    // Последовательный поиск по каждому источнику
    for (let i = 0; i < searchableResources.length; i++) {
      const resource = searchableResources[i];
      
      setSearchProgress({
        total: searchableResources.length,
        processed: i,
        successful,
        failed,
        currentResource: resource.name,
      });

      try {
        console.log(`🔍 Поиск в источнике: ${resource.name} (${i + 1}/${searchableResources.length})`);
        await referencesService.discoverNewsForResource(resource.id, selectedProvider);
        successful++;
        
        // Небольшая задержка между запросами
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.error(`❌ Ошибка поиска в источнике ${resource.name}:`, error);
        failed++;
      }
    }

    // Финальное обновление прогресса
    setSearchProgress({
      total: searchableResources.length,
      processed: searchableResources.length,
      successful,
      failed,
      currentResource: null,
    });

    setIsSearching(false);

    // Показываем результат
    if (failed === 0) {
      toast.success('Поиск завершен', {
        description: `Успешно запущен поиск во всех ${successful} источниках`,
      });
    } else {
      toast.warning('Поиск завершен с ошибками', {
        description: `Успешно: ${successful}, Ошибки: ${failed}`,
      });
    }

    if (onComplete) {
      onComplete();
    }
  };

  const handleClose = () => {
    if (!isSearching) {
      onOpenChange(false);
    }
  };

  const progressPercent = searchProgress.total > 0
    ? Math.round((searchProgress.processed / searchProgress.total) * 100)
    : 0;

  const isComplete = searchProgress.processed === searchProgress.total && searchProgress.total > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Глобальный поиск новостей
          </DialogTitle>
          <DialogDescription>
            Запустить автоматический поиск новостей по всем источникам
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Информация о количестве источников */}
          <Card className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Всего источников:</span>
                <Badge variant="outline">{resources.length}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Доступно для автопоиска:</span>
                <Badge className="bg-green-500">{searchableResources.length}</Badge>
              </div>
              {resources.length > searchableResources.length && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {resources.length - searchableResources.length} источников с типом "Ручной ввод" будут пропущены
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </Card>

          {/* Выбор провайдера - показываем только если поиск не запущен */}
          {!isSearching && !isComplete && (
            <div>
              <h3 className="font-semibold mb-3">Выберите провайдер LLM</h3>
              <ProviderSelection
                selectedProvider={selectedProvider}
                onProviderChange={setSelectedProvider}
              />
            </div>
          )}

          {/* Прогресс поиска */}
          {(isSearching || isComplete) && (
            <Card className="p-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {isComplete ? 'Поиск завершен' : 'Выполняется поиск...'}
                  </span>
                  <span className="text-muted-foreground">
                    {searchProgress.processed} / {searchProgress.total}
                  </span>
                </div>
                <Progress value={progressPercent} className="h-2" />
                <div className="text-xs text-muted-foreground text-center">
                  {progressPercent}%
                </div>
              </div>

              {/* Текущий источник */}
              {searchProgress.currentResource && (
                <div className="flex items-center gap-2 text-sm p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span className="text-blue-900 dark:text-blue-100">
                    Поиск: {searchProgress.currentResource}
                  </span>
                </div>
              )}

              {/* Статистика */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="text-xs text-green-700 dark:text-green-300">Успешно</p>
                    <p className="text-lg font-bold text-green-900 dark:text-green-100">
                      {searchProgress.successful}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <div>
                    <p className="text-xs text-red-700 dark:text-red-300">Ошибки</p>
                    <p className="text-lg font-bold text-red-900 dark:text-red-100">
                      {searchProgress.failed}
                    </p>
                  </div>
                </div>
              </div>

              {/* Время выполнения */}
              {searchStartTime && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
                  <Clock className="w-3 h-3" />
                  Начато: {searchStartTime.toLocaleTimeString('ru-RU', { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit' 
                  })}
                </div>
              )}
            </Card>
          )}

          {/* Предупреждение */}
          {!isSearching && !isComplete && searchableResources.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Поиск будет выполнен последовательно для каждого источника. 
                Это может занять несколько минут. Пожалуйста, не закрывайте это окно во время поиска.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSearching}
          >
            {isComplete ? 'Закрыть' : 'Отмена'}
          </Button>
          {!isComplete && (
            <Button
              onClick={handleStartSearch}
              disabled={isSearching || searchableResources.length === 0}
              className="flex items-center gap-2"
            >
              {isSearching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Поиск выполняется...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Запустить поиск ({searchableResources.length})
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}