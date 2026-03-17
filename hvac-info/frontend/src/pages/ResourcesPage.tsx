import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import referencesService, { Resource } from '../services/referencesService';
import MainLayout from '../components/MainLayout';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Globe, FolderOpen, Grid3x3, Globe2, MapPin, Sparkles, Award, Users, Plus, AlertTriangle, ArrowUpDown, Zap, Hand, Cog, Search, X } from 'lucide-react';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import NewsDiscoveryDialog from '../components/NewsDiscoveryDialog';
import ApiErrorBanner from '../components/ApiErrorBanner';
import SourceStatisticsDashboard from '../components/statistics/SourceStatisticsDashboard';
import ResourceForm from '../components/forms/ResourceForm';
import ResourceDetailDialog from '../components/ResourceDetailDialog';
import ResourceDiscoveryButton from '../components/ResourceDiscoveryButton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { useTranslation } from 'react-i18next';

type GroupingMode = 'sections' | 'alphabet';
type SortingMode = 'name' | 'error_rate' | 'ranking_score';

interface GroupedResources {
  [key: string]: Resource[];
}

export default function ResourcesPage() {
  const { language, getLocalizedField } = useLanguage();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('sections');
  const [sortingMode, setSortingMode] = useState<SortingMode>('name');
  const [showProblematicOnly, setShowProblematicOnly] = useState(false);
  const [discoveryDialogOpen, setDiscoveryDialogOpen] = useState(false);
  const [resourceFormOpen, setResourceFormOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailResourceId, setDetailResourceId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = user?.is_staff === true;
  const totalDiscoverableResources = useMemo(() => {
    return resources.filter((r) => r.source_type !== 'manual').length;
  }, [resources]);

  useEffect(() => {
    loadResources();
  }, [language, showProblematicOnly, sortingMode]);

  const loadResources = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError('');
      
      const filters: { is_problematic?: boolean; ordering?: string } = {};
      
      // Фильтр проблемных источников
      if (showProblematicOnly) {
        filters.is_problematic = true;
      }
      
      // Сортировка
      if (sortingMode === 'error_rate') {
        filters.ordering = '-error_rate'; // По убыванию (самые проблемные сверху)
      } else if (sortingMode === 'ranking_score') {
        filters.ordering = '-ranking_score'; // По убыванию (лучшие сверху)
      }
      
      const data = await referencesService.getResources(language, filters);
      setResources(data);
    } catch (err: any) {
      console.error('Error loading resources:', err);
      setError(err); // Сохраняем весь объект ошибки
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Группировка ресурсов
  const groupedResources = useMemo(() => {
    // Сначала фильтруем по поисковому запросу
    let filteredResources = resources;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filteredResources = resources.filter((resource) => {
        // Поиск по названию
        const matchesName = resource.name.toLowerCase().includes(query);
        
        // Поиск по URL
        const matchesUrl = resource.url.toLowerCase().includes(query);
        
        // Поиск по описанию (на всех языках)
        const matchesDescription = 
          resource.description?.toLowerCase().includes(query) ||
          resource.description_ru?.toLowerCase().includes(query) ||
          resource.description_en?.toLowerCase().includes(query) ||
          resource.description_de?.toLowerCase().includes(query) ||
          resource.description_pt?.toLowerCase().includes(query);
        
        return matchesName || matchesUrl || matchesDescription;
      });
    }
    
    // Затем группируем отфильтрованные ресурсы
    if (groupingMode === 'sections') {
      // Группировка по разделам
      const groups: GroupedResources = {};
      
      filteredResources.forEach((resource) => {
        const section = resource.section || 'Прочие / Other';
        if (!groups[section]) {
          groups[section] = [];
        }
        groups[section].push(resource);
      });

      // Сортировка ресурсов внутри каждой группы
      Object.keys(groups).forEach((section) => {
        groups[section].sort((a, b) => a.name.localeCompare(b.name));
      });

      return groups;
    } else {
      // Группировка по первой букве
      const groups: GroupedResources = {};
      
      filteredResources.forEach((resource) => {
        const firstLetter = resource.name[0].toUpperCase();
        if (!groups[firstLetter]) {
          groups[firstLetter] = [];
        }
        groups[firstLetter].push(resource);
      });

      // Сортировка ресурсов внутри каждой группы
      Object.keys(groups).forEach((letter) => {
        groups[letter].sort((a, b) => a.name.localeCompare(b.name));
      });

      return groups;
    }
  }, [resources, groupingMode, searchQuery]);

  // Сортировка ключей групп
  const sortedGroupKeys = useMemo(() => {
    const keys = Object.keys(groupedResources);
    if (groupingMode === 'alphabet') {
      return keys.sort();
    }
    return keys.sort((a, b) => a.localeCompare(b));
  }, [groupedResources, groupingMode]);

  // Функция для выбора иконки раздела
  const getSectionIcon = (sectionName: string) => {
    const name = sectionName.toLowerCase();
    
    // Географические регионы
    if (name.includes('north america') || name.includes('latin america') || name.includes('америк')) {
      return <Globe2 className="w-6 h-6 text-blue-500" />;
    }
    if (name.includes('europe') || name.includes('европ')) {
      return <MapPin className="w-6 h-6 text-purple-500" />;
    }
    if (name.includes('asia') || name.includes('pacific') || name.includes('азия')) {
      return <Globe2 className="w-6 h-6 text-amber-500" />;
    }
    
    // Специализированные ресурсы
    if (name.includes('specialized') || name.includes('niche') || name.includes('специализ')) {
      return <Sparkles className="w-6 h-6 text-pink-500" />;
    }
    
    // Профессиональные сообщества
    if (name.includes('community') || name.includes('professional') || name.includes('сообщество')) {
      return <Users className="w-6 h-6 text-green-500" />;
    }
    
    // Награды и достижения
    if (name.includes('award') || name.includes('excellence') || name.includes('награ')) {
      return <Award className="w-6 h-6 text-yellow-500" />;
    }
    
    // Прочие
    return <FolderOpen className="w-6 h-6 text-gray-500" />;
  };

  return (
    <MainLayout>
      <div className="p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1>{t('resources.title')}</h1>
            
            <div className="flex items-center gap-3">
              {/* Кнопка "Найти новости" - только для админов */}
              {isAdmin && !loading && !error && resources.length > 0 && (
                <Button
                  onClick={() => setDiscoveryDialogOpen(true)}
                  className="flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Найти новости
                </Button>
              )}
              
              {/* Кнопки группировки */}
              {!loading && !error && resources.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant={groupingMode === 'sections' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setGroupingMode('sections')}
                    className="flex items-center gap-2"
                  >
                    <FolderOpen className="w-4 h-4" />
                    По разделам
                  </Button>
                  <Button
                    variant={groupingMode === 'alphabet' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setGroupingMode('alphabet')}
                    className="flex items-center gap-2"
                  >
                    <Grid3x3 className="w-4 h-4" />
                    По алфавиту
                  </Button>
                </div>
              )}
              
              {/* Кнопка добавления ресурса - только для админов */}
              {isAdmin && (
                <Button
                  onClick={() => {
                    setSelectedResource(null);
                    setResourceFormOpen(true);
                  }}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Добавить ресурс
                </Button>
              )}
            </div>
          </div>

          {loading && (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">{t('common.loading')}</p>
            </Card>
          )}

          {error && (
            <ApiErrorBanner
              error={error}
              onRetry={loadResources}
            />
          )}

          {!loading && !error && resources.length === 0 && (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">{t('resources.notFound')}</p>
            </Card>
          )}

          {!loading && !error && resources.length > 0 && (
            <div className="space-y-8">
              {/* Дашборд статистики - только для админов */}
              {isAdmin && (
                <SourceStatisticsDashboard />
              )}

              {/* Поле поиска */}
              <Card className="p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Поиск по названию, URL или описанию..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-10"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Найдено: {Object.values(groupedResources).reduce((sum, group) => sum + group.length, 0)} источников
                  </p>
                )}
              </Card>

              {/* Панель фильтров и сортировки - только для админов */}
              {isAdmin && (
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Фильтр проблемных источников */}
                    <Button
                      variant={showProblematicOnly ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setShowProblematicOnly(!showProblematicOnly)}
                      className="flex items-center gap-2"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      {showProblematicOnly ? 'Все источники' : 'Только проблемные'}
                      {showProblematicOnly && resources.length > 0 && (
                        <span className="ml-1 px-2 py-0.5 text-xs bg-background rounded-full">
                          {resources.length}
                        </span>
                      )}
                    </Button>

                    <div className="h-6 w-px bg-border" />

                    {/* Сортировка */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Сортировка:</span>
                      <Button
                        variant={sortingMode === 'name' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSortingMode('name')}
                      >
                        По названию
                      </Button>
                      <Button
                        variant={sortingMode === 'error_rate' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSortingMode('error_rate')}
                        className="flex items-center gap-2"
                      >
                        <ArrowUpDown className="w-3 h-3" />
                        По % ошибок
                      </Button>
                      <Button
                        variant={sortingMode === 'ranking_score' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSortingMode('ranking_score')}
                        className="flex items-center gap-2"
                      >
                        <ArrowUpDown className="w-3 h-3" />
                        По рейтингу
                      </Button>
                    </div>

                    {/* Информация о количестве */}
                    {showProblematicOnly && resources.length > 0 && (
                      <div className="ml-auto flex items-center gap-2 text-sm">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span className="text-muted-foreground">
                          Найдено <span className="font-semibold text-foreground">{resources.length}</span> проблемных источников
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {sortedGroupKeys.map((groupKey) => (
                <div key={groupKey} className="space-y-4">
                  {/* Заголовок группы */}
                  <div className="flex items-center gap-3 px-1">
                    {groupingMode === 'sections' ? (
                      getSectionIcon(groupKey)
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-primary font-semibold">{groupKey}</span>
                      </div>
                    )}
                    <h2 className="text-lg">{groupKey}</h2>
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-sm text-muted-foreground">
                      {groupedResources[groupKey].length} {groupedResources[groupKey].length === 1 ? 'ресурс' : 'ресурсов'}
                    </span>
                  </div>

                  {/* Таблица ресурсов группы */}
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20"></TableHead>
                          <TableHead className="w-80">{t('resources.name')}</TableHead>
                          <TableHead className="w-16 text-center">Тип</TableHead>
                          {isAdmin && <TableHead className="w-40 text-center">Статистика</TableHead>}
                          <TableHead>{t('resources.description')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupedResources[groupKey].map((resource) => {
                          const isProblematic = resource.is_problematic === true;
                          const errorRate = resource.statistics?.error_rate ?? 0;
                          const hasStats = resource.statistics !== undefined;
                          
                          return (
                            <TableRow 
                              key={resource.id} 
                              onClick={() => {
                                setDetailResourceId(resource.id);
                                setDetailDialogOpen(true);
                              }}
                              className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                                isProblematic 
                                  ? 'bg-red-50 dark:bg-red-950/10 border-l-4 border-l-red-500' 
                                  : ''
                              }`}
                            >
                              <TableCell className="py-4">
                                <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center p-2 relative">
                                  {resource.logo ? (
                                    <ImageWithFallback
                                      src={resource.logo}
                                      alt={resource.name}
                                      className="w-full h-full object-contain"
                                    />
                                  ) : (
                                    <Globe className="w-8 h-8 text-muted-foreground opacity-50" />
                                  )}
                                  {isProblematic && (
                                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                                      <AlertTriangle className="w-3 h-3 text-white" />
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="py-4">
                                <div className="flex items-center gap-2">
                                  {isProblematic && (
                                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                                  )}
                                  <span className={`font-medium ${isProblematic ? 'text-red-900 dark:text-red-100' : ''}`}>
                                    {resource.name}
                                  </span>
                                </div>
                              </TableCell>
                              {/* Колонка типа */}
                              <TableCell className="py-4 text-center">
                                <div className="flex items-center justify-center">
                                  {resource.source_type === 'auto' && (
                                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center" title="Автоматический поиск">
                                      <Zap className="w-4 h-4 text-white" />
                                    </div>
                                  )}
                                  {resource.source_type === 'manual' && (
                                    <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center" title="Ручной ввод">
                                      <Hand className="w-4 h-4 text-white" />
                                    </div>
                                  )}
                                  {resource.source_type === 'hybrid' && (
                                    <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center" title="Гибридный режим">
                                      <Cog className="w-4 h-4 text-white" />
                                    </div>
                                  )}
                                  {!resource.source_type && (
                                    <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center" title="Не указан">
                                      <Globe className="w-4 h-4 text-white" />
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              {/* Колонка статистики - только для админов */}
                              {isAdmin && (
                                <TableCell className="py-4">
                                  {hasStats ? (
                                    <div className="flex flex-col items-center gap-1">
                                      {/* Error Rate */}
                                      <div className="flex items-center gap-1">
                                        <span 
                                          className={`text-xs font-semibold ${
                                            errorRate >= 30 
                                              ? 'text-red-600 dark:text-red-400' 
                                              : errorRate >= 10
                                              ? 'text-amber-600 dark:text-amber-400'
                                              : 'text-green-600 dark:text-green-400'
                                          }`}
                                        >
                                          {errorRate.toFixed(1)}%
                                        </span>
                                        <span className="text-xs text-muted-foreground">ошибок</span>
                                      </div>
                                      {/* Ranking Score */}
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-muted-foreground">
                                          Рейтинг: {(resource.statistics?.ranking_score ?? 0).toFixed(0)}
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">Нет данных</span>
                                  )}
                                </TableCell>
                              )}
                              <TableCell className="py-4 max-w-md">
                                {getLocalizedField(resource, 'description') && (
                                  <div className="overflow-hidden">
                                    <p className="text-sm text-muted-foreground line-clamp-2 whitespace-normal">
                                      {getLocalizedField(resource, 'description')}
                                    </p>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Диалог автоматического поиска новостей */}
      <NewsDiscoveryDialog
        open={discoveryDialogOpen}
        onOpenChange={setDiscoveryDialogOpen}
        totalResources={totalDiscoverableResources}
      />

      {/* Форма добавления/редактирования ресурса */}
      <ResourceForm
        open={resourceFormOpen}
        onOpenChange={setResourceFormOpen}
        onSuccess={() => {
          loadResources(true);
          setSelectedResource(null);
        }}
        resource={selectedResource}
      />

      {/* Диалог деталей ресурса */}
      <ResourceDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        resourceId={detailResourceId ?? 0}
        onUpdate={() => loadResources(true)}
      />
    </MainLayout>
  );
}