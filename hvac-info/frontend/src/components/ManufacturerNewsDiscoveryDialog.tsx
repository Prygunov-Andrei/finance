import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Calendar, AlertCircle, Sparkles, Clock } from 'lucide-react';
import referencesService from '../services/referencesService';
import ManufacturerNewsDiscoveryProgress from './ManufacturerNewsDiscoveryProgress';
import { useNavigate } from 'react-router';
import { useDiscovery } from '../hooks/useDiscovery';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface ManufacturerNewsDiscoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalManufacturers: number;
}

export default function ManufacturerNewsDiscoveryDialog({ open, onOpenChange, totalManufacturers }: ManufacturerNewsDiscoveryDialogProps) {
  const navigate = useNavigate();
  const todayStr = new Date().toISOString().split('T')[0];

  const {
    stage,
    loading,
    error,
    results,
    discoveryInfo,
    loadingInfo,
    selectedLastSearchDate,
    setSelectedLastSearchDate,
    handleStartDiscovery,
    handleComplete,
    handleError,
    formatDate,
    formatDateShort,
  } = useDiscovery({
    open,
    totalItems: totalManufacturers,
    loadInfoFn: referencesService.getManufacturerNewsDiscoveryInfo,
    startDiscoveryFn: referencesService.startManufacturerNewsDiscovery,
  });

  const handleViewNews = () => {
    onOpenChange(false);
    navigate('/news');
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {/* Стадия подтверждения */}
        {stage === 'confirm' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <DialogTitle>Автоматический поиск новостей по производителям</DialogTitle>
              </div>
              <DialogDescription>
                Система автоматически найдет и суммаризирует новости о производителях через LLM API
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Информация о поиске */}
              <div className="grid gap-3">
                {/* Дата последнего поиска */}
                {!loadingInfo && discoveryInfo && (
                  <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <Clock className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-muted-foreground">Последний поиск</p>
                      <p className="text-base font-semibold text-blue-900">
                        {formatDate(discoveryInfo.last_discovery_date)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Период поиска */}
                {!loadingInfo && discoveryInfo && (
                  <div className="flex items-start gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <Calendar className="w-5 h-5 text-purple-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-muted-foreground">Период поиска</p>
                      <p className="text-base font-semibold text-purple-900">
                        с{' '}
                        {formatDateShort(
                          (selectedLastSearchDate
                            ? new Date(`${selectedLastSearchDate}T00:00:00`).toISOString()
                            : discoveryInfo.period_start) || todayStr
                        )}{' '}
                        по {formatDateShort(discoveryInfo.period_end || new Date().toISOString())}
                      </p>

                      <div className="mt-2 space-y-2">
                        <Label htmlFor="manufacturer-discovery-last-search-date">Дата начала периода</Label>
                        <Input
                          id="manufacturer-discovery-last-search-date"
                          type="date"
                          value={selectedLastSearchDate}
                          max={todayStr}
                          onChange={(e) => setSelectedLastSearchDate(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Конец периода всегда {formatDateShort(discoveryInfo.period_end || new Date().toISOString())}.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Количество производителей */}
                <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                  <Sparkles className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Производители для обработки</p>
                    <p className="text-2xl font-bold text-primary">{totalManufacturers}</p>
                  </div>
                </div>
              </div>

              {/* Предупреждение */}
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Важно:</strong> Поиск может занять несколько минут. Все найденные новости будут сохранены 
                  как черновики для последующего редактирования.
                </AlertDescription>
              </Alert>

              {/* Ошибка */}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Отмена
              </Button>
              <Button onClick={handleStartDiscovery} disabled={loading}>
                {loading ? 'Запуск...' : 'Начать поиск'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Стадия прогресса */}
        {stage === 'progress' && (
          <>
            <DialogHeader>
              <DialogTitle>Поиск новостей по производителям</DialogTitle>
              <DialogDescription>
                Пожалуйста, не закрывайте это окно. Поиск выполняется...
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <ManufacturerNewsDiscoveryProgress onComplete={handleComplete} onError={handleError} />
            </div>
          </>
        )}

        {/* Стадия результатов */}
        {stage === 'results' && results && (
          <>
            <DialogHeader>
              <DialogTitle>Результаты поиска</DialogTitle>
              <DialogDescription>
                Поиск новостей по производителям успешно завершен
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Метрики */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground mb-1">Создано новостей</p>
                  <p className="text-3xl font-bold text-green-700">{results.created || 0}</p>
                </div>
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground mb-1">Ошибок</p>
                  <p className="text-3xl font-bold text-orange-700">{results.errors || 0}</p>
                </div>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
                  <p className="text-sm text-muted-foreground mb-1">Обработано</p>
                  <p className="text-3xl font-bold text-blue-700">{results.total_processed || results.total}</p>
                </div>
              </div>

              {/* Дополнительная информация */}
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Все новости сохранены как <strong>черновики</strong>. Вы можете просмотреть и отредактировать 
                  их на странице новостей, используя фильтр "Черновики".
                </AlertDescription>
              </Alert>
            </div>

            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                Вернуться к производителям
              </Button>
              <Button onClick={handleViewNews}>
                Просмотреть новости
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}