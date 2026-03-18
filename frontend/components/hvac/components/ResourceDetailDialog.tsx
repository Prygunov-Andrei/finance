import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from './ui/alert-dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import referencesService, { Resource } from '../services/referencesService';
import { 
  ExternalLink, 
  AlertTriangle, 
  Globe, 
  Settings, 
  FileText, 
  BarChart3,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Calendar,
  Search,
  Zap,
  Hand,
  Cog,
  Sparkles,
  Trash2,
  Loader2
} from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import ProviderSelection from './ProviderSelection';

interface ResourceDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceId: number;
  onUpdate?: () => void;
}

// Языки с флагами
const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ru', name: 'Русский (Russian)', flag: '🇷🇺' },
  { code: 'es', name: 'Español (Spanish)', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch (German)', flag: '🇩🇪' },
  { code: 'pt', name: 'Português (Portuguese)', flag: '🇵🇹' },
  { code: 'fr', name: 'Français (French)', flag: '🇫🇷' },
  { code: 'it', name: 'Italiano (Italian)', flag: '🇮🇹' },
  { code: 'tr', name: 'Türkçe (Turkish)', flag: '🇹🇷' },
  { code: 'ar', name: 'العربية (Arabic)', flag: '🇸🇦' },
  { code: 'zh', name: '中文 (Chinese)', flag: '🇨🇳' },
  { code: 'ja', name: '日本語 (Japanese)', flag: '🇯🇵' },
  { code: 'ko', name: '한국어 (Korean)', flag: '🇰🇷' },
  { code: 'pl', name: 'Polski (Polish)', flag: '🇵🇱' },
  { code: 'nl', name: 'Nederlands (Dutch)', flag: '🇳🇱' },
  { code: 'sv', name: 'Svenska (Swedish)', flag: '🇸🇪' },
  { code: 'other', name: 'Other', flag: '🌐' },
];

export default function ResourceDetailDialog({ 
  open, 
  onOpenChange, 
  resourceId,
  onUpdate 
}: ResourceDetailDialogProps) {
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('auto');
  const [discovering, setDiscovering] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchStatus, setSearchStatus] = useState<{
    isRunning: boolean;
    startTime: Date | null;
    message: string;
  }>({
    isRunning: false,
    startTime: null,
    message: '',
  });

  // Локальное состояние формы
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    section: '',
    description: '',
    source_type: 'auto' as 'auto' | 'manual' | 'hybrid',
    language: 'en',
    custom_search_instructions: '',
    internal_notes: '',
  });

  useEffect(() => {
    if (open && resourceId) {
      loadResource();
    }
  }, [open, resourceId]);

  const loadResource = async () => {
    try {
      setLoading(true);
      const data = await referencesService.getResource(resourceId);
      setResource(data);
      
      // Инициализация формы
      setFormData({
        name: data.name || '',
        url: data.url || '',
        section: data.section || '',
        description: data.description || '',
        source_type: data.source_type || 'auto',
        language: data.language || 'en',
        custom_search_instructions: data.custom_search_instructions || '',
        internal_notes: data.internal_notes || '',
      });
      
      setHasChanges(false);
    } catch (error: any) {
      console.error('Error loading resource:', error);
      toast.error('Ошибка загрузки источника');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      await referencesService.updateResource(resourceId, {
        name: formData.name,
        url: formData.url,
        section: formData.section,
        description: formData.description,
        source_type: formData.source_type,
        language: formData.language,
        custom_search_instructions: formData.custom_search_instructions,
        internal_notes: formData.internal_notes,
      });
      
      toast.success('Изменения сохранены');
      setHasChanges(false);
      
      if (onUpdate) {
        onUpdate();
      }
      
      // Перезагрузка данных
      await loadResource();
    } catch (error: any) {
      console.error('Error saving resource:', error);
      
      // Обработка ошибок валидации
      if (error.response?.data) {
        const errors = error.response.data;
        Object.keys(errors).forEach(key => {
          const message = Array.isArray(errors[key]) ? errors[key][0] : errors[key];
          toast.error(`${key}: ${message}`);
        });
      } else {
        toast.error('Ошибка при сохранении изменений');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const getSourceTypeIcon = (type: string) => {
    switch (type) {
      case 'auto': return <Zap className="w-4 h-4" />;
      case 'manual': return <Hand className="w-4 h-4" />;
      case 'hybrid': return <Cog className="w-4 h-4" />;
      default: return <Globe className="w-4 h-4" />;
    }
  };

  const getSourceTypeColor = (type: string) => {
    switch (type) {
      case 'auto': return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20';
      case 'manual': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20';
      case 'hybrid': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20';
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-950/20';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Нет данных';
    const date = new Date(dateString);
    return date.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleDiscover = async () => {
    if (!resource) return;
    // Проверка на тип источника 'manual'
    if (resource.source_type === 'manual') {
      toast.error('Невозможно запустить автоматический поиск', {
        description: `Источник "${resource.name}" имеет тип "Ручной ввод". Для таких источников автоматический поиск новостей не поддерживается.`,
      });
      return;
    }

    setDiscovering(true);
    setSearchStatus({
      isRunning: true,
      startTime: new Date(),
      message: 'Инициализация поиска...',
    });

    try {
      console.log(`🚀 Запуск поиска новостей для источника: ${resource.name}`);
      console.log(`🤖 Провайдер: ${selectedProvider}`);

      const result = await referencesService.discoverNewsForResource(resource.id, selectedProvider);

      setSearchStatus({
        isRunning: true,
        startTime: new Date(),
        message: `Поиск новостей запущен. Провайдер: ${selectedProvider}`,
      });

      toast.success('Поиск новостей запущен', {
        description: result.message || `Поиск новостей для источника \"${resource.name}\" начат. Провайдер: ${selectedProvider}`,
      });

      // Переключаемся на вкладку статистики после запуска
      setActiveTab('statistics');

      // Запускаем периодическое обновление данных каждые 3 секунд
      const pollInterval = setInterval(async () => {
        try {
          const updatedResource = await referencesService.getResource(resourceId);
          setResource(updatedResource);

          // Проверяем, изменилась ли статистика (поиск завершен)
          if (updatedResource.statistics?.last_search_date !== resource?.statistics?.last_search_date) {
            setSearchStatus({
              isRunning: false,
              startTime: null,
              message: 'Поиск завершен',
            });
            clearInterval(pollInterval);
            toast.success('Поиск завершен', {
              description: `Найдено новостей: ${updatedResource.statistics?.total_news_found || 0}`,
            });
          }
        } catch (error) {
          // Ошибка polling - не критично
        }
      }, 3000);
      
      // Останавливаем polling через 60 секунд в любом случае
      setTimeout(() => {
        clearInterval(pollInterval);
        setSearchStatus({
          isRunning: false,
          startTime: null,
          message: '',
        });
      }, 60000);
      
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail 
        || err.response?.data?.error 
        || err.message 
        || 'Неизвестная ошибка';

      setSearchStatus({
        isRunning: false,
        startTime: null,
        message: `Ошибка: ${errorMessage}`,
      });

      toast.error('Ошибка запуска поиска', {
        description: errorMessage,
      });
    } finally {
      setDiscovering(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await referencesService.deleteResource(resourceId);
      toast.success('Источник удален');
      onOpenChange(false);
      if (onUpdate) {
        onUpdate();
      }
    } catch (error: any) {
      console.error('Error deleting resource:', error);
      toast.error('Ошибка удаления источника');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Загрузка источника</DialogTitle>
            <DialogDescription>Пожалуйста, подождите, идет загрузка информации об источнике...</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-muted-foreground">Загрузка...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!resource) {
    return null;
  }

  const isProblematic = resource.is_problematic === true;
  const errorRate = resource.statistics?.error_rate ?? 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <div className="flex items-start gap-4">
              {/* Логотип */}
              <div className="w-16 h-16 bg-muted rounded flex items-center justify-center p-2 flex-shrink-0">
                {resource.logo ? (
                  <ImageWithFallback
                    src={resource.logo}
                    alt={resource.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Globe className="w-8 h-8 text-muted-foreground opacity-50" />
                )}
              </div>

              {/* Информация */}
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-2xl flex items-center gap-2 flex-wrap">
                  {isProblematic && (
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                  )}
                  <span className={isProblematic ? 'text-red-900 dark:text-red-100' : ''}>
                    {resource.name}
                  </span>
                </DialogTitle>
                
                <DialogDescription className="sr-only">
                  Детальная информация об источнике новостей {resource.name}. 
                  Редактирование настроек, просмотр статистики и управление источником.
                </DialogDescription>
                
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1 min-w-0 max-w-full break-all"
                    title={resource.url}
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span className="min-w-0 break-all">{resource.url}</span>
                  </a>
                  
                  {resource.section && (
                    <Badge variant="outline">{resource.section}</Badge>
                  )}
                  
                  <Badge className={getSourceTypeColor(resource.source_type || 'auto')}>
                    {getSourceTypeIcon(resource.source_type || 'auto')}
                    <span className="ml-1">
                      {resource.source_type === 'auto' ? 'Автоматический' : 
                       resource.source_type === 'manual' ? 'Ручной' : 'Гибридный'}
                    </span>
                  </Badge>
                </div>
              </div>
            </div>

            {/* Предупреждение о проблемном источнике */}
            {isProblematic && (
              <Card className="mt-4 p-3 border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm text-red-900 dark:text-red-100">
                      Проблемный источник
                    </p>
                    <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                      Процент ошибок: {errorRate.toFixed(1)}% (рекомендуется проверка настроек поиска)
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Индикатор несохраненных изменений */}
            {hasChanges && (
              <Card className="mt-4 p-3 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
                <p className="text-sm text-amber-900 dark:text-amber-100">
                  ⚠️ Есть несохраненные изменения
                </p>
              </Card>
            )}
          </DialogHeader>

          {/* Статус-бар поиска новостей */}
          {searchStatus.isRunning && (
            <Card className="mt-4 p-4 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm text-blue-900 dark:text-blue-100">
                      {searchStatus.message}
                    </p>
                    {searchStatus.startTime && (
                      <Badge variant="outline" className="text-blue-700 dark:text-blue-300">
                        Запущено: {searchStatus.startTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Данные обновляются автоматически... Ожидайте завершения поиска.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Вкладки */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
            <div className="space-y-2">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Основное
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Настройки
                </TabsTrigger>
                <TabsTrigger value="discovery" className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Поиск
                </TabsTrigger>
              </TabsList>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="internal" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Служебное
                </TabsTrigger>
                <TabsTrigger value="statistics" className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Статистика
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Вкладка: Основное */}
            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Название источника</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    placeholder="Название источника новостей"
                  />
                </div>

                <div>
                  <Label htmlFor="url">URL</Label>
                  <Input
                    id="url"
                    value={formData.url}
                    onChange={(e) => handleFieldChange('url', e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>

                <div>
                  <Label htmlFor="section">Секция/Регион</Label>
                  <Input
                    id="section"
                    value={formData.section}
                    onChange={(e) => handleFieldChange('section', e.target.value)}
                    placeholder="Например: Europe, North America"
                  />
                </div>

                <div>
                  <Label htmlFor="description">Описание</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleFieldChange('description', e.target.value)}
                    placeholder="Краткое описание источника новостей"
                    rows={4}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Вкладка: Настройки поиска */}
            <TabsContent value="settings" className="space-y-4 mt-4">
              <div className="space-y-6">
                {/* Тип источника */}
                <div>
                  <Label>Тип источника</Label>
                  <div className="mt-3 space-y-3">
                    {/* Автоматический поиск */}
                    <Card 
                      className={`p-4 cursor-pointer transition-all border-2 ${
                        formData.source_type === 'auto' 
                          ? 'border-green-500 bg-green-50/50 dark:bg-green-950/20' 
                          : 'border-transparent hover:border-muted-foreground/20'
                      }`}
                      onClick={() => handleFieldChange('source_type', 'auto')}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          formData.source_type === 'auto' 
                            ? 'bg-green-500' 
                            : 'bg-muted'
                        }`}>
                          {formData.source_type === 'auto' ? (
                            <CheckCircle2 className="w-5 h-5 text-white" />
                          ) : (
                            <Zap className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 font-medium">
                            <Zap className="w-4 h-4 text-green-600" />
                            Автоматический поиск
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            LLM автоматически ищет новости на сайте источника
                          </p>
                        </div>
                      </div>
                    </Card>

                    {/* Ручной ввод */}
                    <Card 
                      className={`p-4 cursor-pointer transition-all border-2 ${
                        formData.source_type === 'manual' 
                          ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20' 
                          : 'border-transparent hover:border-muted-foreground/20'
                      }`}
                      onClick={() => handleFieldChange('source_type', 'manual')}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          formData.source_type === 'manual' 
                            ? 'bg-red-500' 
                            : 'bg-muted'
                        }`}>
                          {formData.source_type === 'manual' ? (
                            <CheckCircle2 className="w-5 h-5 text-white" />
                          ) : (
                            <Hand className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 font-medium">
                            <Hand className="w-4 h-4 text-red-600" />
                            Ручной ввод
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Новости добавляются вручную, автопоиск отключен
                          </p>
                        </div>
                      </div>
                    </Card>

                    {/* Гибридный режим */}
                    <Card 
                      className={`p-4 cursor-pointer transition-all border-2 ${
                        formData.source_type === 'hybrid' 
                          ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20' 
                          : 'border-transparent hover:border-muted-foreground/20'
                      }`}
                      onClick={() => handleFieldChange('source_type', 'hybrid')}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          formData.source_type === 'hybrid' 
                            ? 'bg-amber-500' 
                            : 'bg-muted'
                        }`}>
                          {formData.source_type === 'hybrid' ? (
                            <CheckCircle2 className="w-5 h-5 text-white" />
                          ) : (
                            <Cog className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 font-medium">
                            <Cog className="w-4 h-4 text-amber-600" />
                            Гибридный режим
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Автопоиск с кастомными инструкциями для LLM
                          </p>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>

                {/* Язык источника */}
                <div>
                  <Label htmlFor="language">Язык источника</Label>
                  <Select
                    value={formData.language}
                    onValueChange={(value) => handleFieldChange('language', value)}
                  >
                    <SelectTrigger id="language" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          <span className="flex items-center gap-2">
                            <span>{lang.flag}</span>
                            <span>{lang.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">
                    Язык контента на сайте источника (для оптимизации поиска)
                  </p>
                </div>

                {/* Кастомные инструкции - показываем только для hybrid */}
                {formData.source_type === 'hybrid' && (
                  <div>
                    <Label htmlFor="custom_instructions">Кастомные инструкции для LLM</Label>
                    <Textarea
                      id="custom_instructions"
                      value={formData.custom_search_instructions}
                      onChange={(e) => handleFieldChange('custom_search_instructions', e.target.value)}
                      placeholder="Оставьте пустым для использования стандартного промпта..."
                      rows={6}
                      className="mt-2 font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Специальные инструкции для LLM по поиску новостей на этом источнике. 
                      Используйте для сложных сайтов с нестандартной структурой.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Вкладка: Поиск */}
            <TabsContent value="discovery" className="space-y-6 mt-4">
              {resource.source_type === 'manual' ? (
                <Card className="p-8 text-center border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
                  <Hand className="w-12 h-12 text-red-600 dark:text-red-400 mx-auto mb-3" />
                  <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">
                    Автоматический поиск недоступен
                  </h3>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Источник "{resource.name}" имеет тип "Ручной ввод". 
                    Для таких источников автоматический поиск новостей не поддерживается.
                  </p>
                </Card>
              ) : (
                <>
                  <div>
                    <h3 className="font-semibold mb-3">Выберите провайдер LLM</h3>
                    <ProviderSelection
                      selectedProvider={selectedProvider}
                      onProviderChange={setSelectedProvider}
                    />
                  </div>
                  
                  <div className="flex justify-center pt-4">
                    <Button
                      onClick={handleDiscover}
                      disabled={discovering}
                      size="lg"
                      className="flex items-center gap-2"
                    >
                      {discovering ? (
                        <>
                          <Sparkles className="w-5 h-5 animate-pulse" />
                          Поиск запущен...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          Запустить поиск новостей
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            {/* Вкладка: Служебное */}
            <TabsContent value="internal" className="space-y-4 mt-4">
              <div>
                <Label htmlFor="internal_notes">Служебные заметки</Label>
                <Textarea
                  id="internal_notes"
                  value={formData.internal_notes}
                  onChange={(e) => handleFieldChange('internal_notes', e.target.value)}
                  placeholder="Служебные заметки о источнике. Видны только администраторам."
                  rows={10}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Используйте для хранения служебной информации, замечаний, проблем и т.д.
                </p>
              </div>
            </TabsContent>

            {/* Вкладка: Статистика */}
            <TabsContent value="statistics" className="space-y-4 mt-4">
              {resource.statistics ? (
                <div className="space-y-6">
                  {/* Общая статистика */}
                  <div>
                    <h3 className="font-semibold mb-3">Общая статистика</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <Search className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                          <div>
                            <p className="text-2xl font-bold">{resource.statistics.total_news_found}</p>
                            <p className="text-sm text-muted-foreground">Всего найдено новостей</p>
                          </div>
                        </div>
                      </Card>

                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <Search className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                          <div>
                            <p className="text-2xl font-bold">{resource.statistics.total_searches}</p>
                            <p className="text-sm text-muted-foreground">Всего поисков</p>
                          </div>
                        </div>
                      </Card>

                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
                          <div>
                            <p className="text-2xl font-bold">{resource.statistics.success_rate.toFixed(1)}%</p>
                            <p className="text-sm text-muted-foreground">Успешность</p>
                          </div>
                        </div>
                      </Card>

                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <XCircle className={`w-8 h-8 ${
                            errorRate >= 30 ? 'text-red-600 dark:text-red-400' :
                            errorRate >= 10 ? 'text-amber-600 dark:text-amber-400' :
                            'text-green-600 dark:text-green-400'
                          }`} />
                          <div>
                            <p className="text-2xl font-bold">{errorRate.toFixed(1)}%</p>
                            <p className="text-sm text-muted-foreground">Процент ошибок</p>
                          </div>
                        </div>
                      </Card>

                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <TrendingUp className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                          <div>
                            <p className="text-2xl font-bold">{resource.statistics.ranking_score.toFixed(1)}</p>
                            <p className="text-sm text-muted-foreground">Рейтинговый балл</p>
                          </div>
                        </div>
                      </Card>

                      <Card className="p-4">
                        <div className="flex items-center gap-3">
                          <Calendar className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                          <div>
                            <p className="text-2xl font-bold">{resource.statistics.news_last_30_days}</p>
                            <p className="text-sm text-muted-foreground">Новостей за 30 дней</p>
                          </div>
                        </div>
                      </Card>
                    </div>
                  </div>

                  {/* Даты */}
                  <div>
                    <h3 className="font-semibold mb-3">Последняя активность</h3>
                    <Card className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Последний поиск:</span>
                        <span className="text-sm font-medium">
                          {formatDate(resource.statistics.last_search_date)}
                        </span>
                      </div>
                    </Card>
                  </div>

                  {/* Детали */}
                  <div>
                    <h3 className="font-semibold mb-3">Детали</h3>
                    <Card className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Поисков без результата:</span>
                        <span className="text-sm font-medium">{resource.statistics.total_no_news}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Поисков с ошибками:</span>
                        <span className="text-sm font-medium text-red-600 dark:text-red-400">
                          {resource.statistics.total_errors}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Проблемный источник:</span>
                        <span className="text-sm font-medium">
                          {isProblematic ? (
                            <Badge variant="destructive">Да (error_rate ≥ 30%)</Badge>
                          ) : (
                            <Badge variant="outline" className="text-green-600 dark:text-green-400">Нет</Badge>
                          )}
                        </span>
                      </div>
                    </Card>
                  </div>
                </div>
              ) : (
                <Card className="p-12 text-center">
                  <p className="text-muted-foreground">Статистика отсутствует</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Статистика появится после первого автоматического поиска новостей
                  </p>
                </Card>
              )}
            </TabsContent>
          </Tabs>

          {/* Футер с кнопками */}
          <DialogFooter className="mt-6 gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !hasChanges}
            >
              {saving ? 'Сохранение...' : 'Сохранить изменения'}
            </Button>
            <Button
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Удалить источник
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог подтверждения удаления */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить источник?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить источник "{resource.name}"? 
              Это действие необратимо и приведет к удалению всех связанных данных.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}