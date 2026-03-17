import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Calendar, AlertCircle, Sparkles, Clock } from 'lucide-react';
import referencesService from '../services/referencesService';
import NewsDiscoveryProgress from './NewsDiscoveryProgress';
import { useNavigate } from 'react-router';
import { useDiscovery } from '../hooks/useDiscovery';
import { Checkbox } from './ui/checkbox';
import searchConfigService, { SearchConfigurationListItem } from '../services/searchConfigService';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';

interface NewsDiscoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalResources: number;
}

export default function NewsDiscoveryDialog({ open, onOpenChange, totalResources }: NewsDiscoveryDialogProps) {
  const navigate = useNavigate();

  const {
    stage,
    loading,
    error,
    results,
    discoveryInfo,
    loadingInfo,
    selectedConfigId,
    setSelectedConfigId,
    selectedSections,
    setSelectedSections,
    selectedLastSearchDate,
    setSelectedLastSearchDate,
    handleStartDiscovery,
    handleComplete,
    handleError,
    formatDate,
    formatDateShort,
  } = useDiscovery({
    open,
    totalItems: totalResources,
    requireConfig: true,
    loadInfoFn: referencesService.getNewsDiscoveryInfo,
    startDiscoveryFn: referencesService.startNewsDiscovery,
  });

  const [configs, setConfigs] = useState<SearchConfigurationListItem[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [configsError, setConfigsError] = useState<string | null>(null);

  const [sectionsCounts, setSectionsCounts] = useState<Record<string, number>>({});
  const [loadingSections, setLoadingSections] = useState(false);
  const [sectionsError, setSectionsError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const loadConfigs = async () => {
      setLoadingConfigs(true);
      setConfigsError(null);
      try {
        const [list, active] = await Promise.all([
          searchConfigService.getConfigurations(),
          searchConfigService.getActiveConfiguration().catch(() => null),
        ]);

        setConfigs(list || []);

        if (active?.id) {
          setSelectedConfigId(active.id);
          return;
        }

        if (Array.isArray(list) && list.length > 0) {
          setSelectedConfigId(list[0].id);
        }
      } catch (e: any) {
        setConfigs([]);
        setSelectedConfigId(null);
        setConfigsError('Не удалось загрузить конфигурации поиска.');
      } finally {
        setLoadingConfigs(false);
      }
    };

    const loadSections = async () => {
      setLoadingSections(true);
      setSectionsError(null);
      try {
        const language = localStorage.getItem('language') || 'ru';
        const resources = await referencesService.getResources(language);

        const counts: Record<string, number> = {};
        for (const r of resources) {
          if (r.source_type === 'manual') continue;
          const sectionName = (r.section || '').trim() || 'Без раздела';
          counts[sectionName] = (counts[sectionName] || 0) + 1;
        }

        setSectionsCounts(counts);
      } catch (e: any) {
        setSectionsCounts({});
        setSectionsError('Не удалось загрузить список секций (регионов).');
      } finally {
        setLoadingSections(false);
      }
    };

    loadConfigs();
    loadSections();
  }, [open]);

  const sectionsList = useMemo(() => {
    return Object.entries(sectionsCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [sectionsCounts]);

  const totalAutoHybridResources = useMemo(() => {
    return sectionsList.reduce((sum, item) => sum + item.count, 0);
  }, [sectionsList]);

  const selectedResourcesCount = useMemo(() => {
    if (selectedSections.length === 0) return totalAutoHybridResources;
    return selectedSections.reduce((sum, sectionName) => sum + (sectionsCounts[sectionName] || 0), 0);
  }, [selectedSections, sectionsCounts, totalAutoHybridResources]);

  const selectedConfig = useMemo(() => {
    if (!selectedConfigId) return null;
    return configs.find((c) => c.id === selectedConfigId) || null;
  }, [configs, selectedConfigId]);

  const todayStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  const handleToggleSection = (sectionName: string) => {
    setSelectedSections((prev) => {
      if (prev.includes(sectionName)) return prev.filter((s) => s !== sectionName);
      return [...prev, sectionName];
    });
  };

  const handleViewNews = () => {
    onOpenChange(false);
    navigate('/news');
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Стадия подтверждения */}
        {stage === 'confirm' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <DialogTitle>Автоматический поиск новостей</DialogTitle>
              </div>
              <DialogDescription>
                Система автоматически найдет и суммаризирует новости из всех источников через LLM API
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
                        <Label htmlFor="discovery-last-search-date">Дата начала периода</Label>
                        <Input
                          id="discovery-last-search-date"
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

                {/* Количество источников */}
                <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                  <Sparkles className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Источники для обработки</p>
                    <p className="text-2xl font-bold text-primary">
                      {totalAutoHybridResources > 0 ? selectedResourcesCount : totalResources}
                    </p>
                    {totalAutoHybridResources > 0 && selectedSections.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Выбрано секций: {selectedSections.length} из {sectionsList.length}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Выбор конфигурации поиска */}
              <div className="p-4 border rounded-lg space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">Конфигурация поиска</p>
                    <p className="text-xs text-muted-foreground">
                      При запуске выбранная конфигурация будет активирована и использована для поиска.
                    </p>
                  </div>
                  {selectedConfig?.is_active && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Активная</span>
                  )}
                </div>

                {configsError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{configsError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="search-config-select">Конфигурация</Label>
                  <Select
                    value={selectedConfigId ? String(selectedConfigId) : undefined}
                    onValueChange={(value) => {
                      const parsed = Number(value);
                      setSelectedConfigId(Number.isFinite(parsed) ? parsed : null);
                    }}
                    disabled={loadingConfigs || configs.length === 0}
                  >
                    <SelectTrigger id="search-config-select" aria-label="Выбор конфигурации поиска">
                      <SelectValue
                        placeholder={loadingConfigs ? 'Загрузка конфигураций...' : 'Выберите конфигурацию'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {configs.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                          {c.is_active ? ' (активная)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Выбор секций/регионов */}
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">Регион (секция источников)</p>
                    <p className="text-xs text-muted-foreground">
                      Если ничего не выбрано — поиск выполняется по всем секциям.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedSections.length === 0}
                      onCheckedChange={(checked) => {
                        if (checked) setSelectedSections([]);
                      }}
                      aria-label="Все секции"
                    />
                    <span className="text-sm">Все секции</span>
                  </div>
                </div>

                {sectionsError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{sectionsError}</AlertDescription>
                  </Alert>
                )}

                {loadingSections && (
                  <p className="text-sm text-muted-foreground">Загрузка секций...</p>
                )}

                {!loadingSections && sectionsList.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {sectionsList.map((s) => (
                      <label
                        key={s.name}
                        className="flex items-center justify-between gap-3 p-2 rounded-md border hover:bg-muted/50 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedSections.includes(s.name)}
                            onCheckedChange={() => handleToggleSection(s.name)}
                            aria-label={s.name}
                          />
                          <span className="text-sm">{s.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{s.count}</span>
                      </label>
                    ))}
                  </div>
                )}
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
              <Button onClick={handleStartDiscovery} disabled={loading || loadingConfigs || !selectedConfigId}>
                {loading ? 'Запуск...' : 'Начать поиск'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Стадия прогресса */}
        {stage === 'progress' && (
          <>
            <DialogHeader>
              <DialogTitle>Поиск новостей</DialogTitle>
              <DialogDescription>
                Пожалуйста, не закрывайте это окно. Поиск выполняется...
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <NewsDiscoveryProgress onComplete={handleComplete} onError={handleError} />
            </div>
          </>
        )}

        {/* Стадия результатов */}
        {stage === 'results' && results && (
          <>
            <DialogHeader>
              <DialogTitle>Результаты поиска</DialogTitle>
              <DialogDescription>
                Поиск новостей успешно завершен
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
                Вернуться к источникам
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