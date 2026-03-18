import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Slider } from './ui/slider';
import { Progress } from './ui/progress';
import { Separator } from './ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';
import { 
  Settings, 
  Zap, 
  Brain, 
  DollarSign,
  AlertCircle,
  Info,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  FileText,
  Shield,
  Save,
  Globe,
  Factory,
} from 'lucide-react';
import searchConfigService, { 
  SearchConfiguration, 
  Provider,
  SearchContextSize,
  PromptsConfig,
  ProviderCheckResults,
} from '../services/searchConfigService';
import { toast } from 'sonner';

interface SearchConfigFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: SearchConfiguration | null;
  onSuccess: () => void;
}

const PROVIDERS: { value: Provider; label: string; description: string; color: string }[] = [
  { value: 'grok', label: 'Grok (xAI)', description: 'Быстрый поиск с интернет-доступом', color: 'purple' },
  { value: 'anthropic', label: 'Claude (Anthropic)', description: 'Глубокий анализ текста', color: 'orange' },
  { value: 'gemini', label: 'Gemini (Google)', description: 'Мультимодальная модель', color: 'blue' },
  { value: 'openai', label: 'OpenAI GPT', description: 'Универсальная модель с веб-поиском', color: 'green' },
];

const CONTEXT_SIZES: { value: SearchContextSize; label: string }[] = [
  { value: 'low', label: 'Low (экономный)' },
  { value: 'medium', label: 'Medium (баланс)' },
  { value: 'high', label: 'High (максимум)' },
];

const WIZARD_STEPS = [
  { id: 1, title: 'Название и провайдеры', icon: Settings },
  { id: 2, title: 'Модели и параметры', icon: Brain },
  { id: 3, title: 'Промпты', icon: FileText },
  { id: 4, title: 'Стоимость', icon: DollarSign },
  { id: 5, title: 'Проверка и сохранение', icon: Shield },
];

const LANGUAGES = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
];

const PROVIDER_COLORS: Record<string, string> = {
  grok: 'bg-purple-500',
  anthropic: 'bg-orange-500',
  gemini: 'bg-blue-500',
  openai: 'bg-green-500',
};

export default function SearchConfigFormDialog({
  open,
  onOpenChange,
  config,
  onSuccess,
}: SearchConfigFormDialogProps) {
  const isEdit = config !== null;
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [defaultPrompts, setDefaultPrompts] = useState<PromptsConfig | null>(null);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [checkingProviders, setCheckingProviders] = useState(false);
  const [providerResults, setProviderResults] = useState<ProviderCheckResults | null>(null);
  const [promptLangTab, setPromptLangTab] = useState('ru');

  const [formData, setFormData] = useState({
    name: '',
    primary_provider: 'grok' as Provider,
    fallback_chain: [] as string[],
    temperature: 0.3,
    timeout: 120,
    max_news_per_resource: 10,
    delay_between_requests: 0.5,
    max_search_results: 5,
    search_context_size: 'low' as SearchContextSize,
    grok_model: 'grok-4-1-fast',
    anthropic_model: 'claude-3-5-haiku-20241022',
    gemini_model: 'gemini-2.0-flash-exp',
    openai_model: 'gpt-4o',
    grok_input_price: 3.0,
    grok_output_price: 15.0,
    anthropic_input_price: 0.80,
    anthropic_output_price: 4.0,
    gemini_input_price: 0.075,
    gemini_output_price: 0.30,
    openai_input_price: 2.50,
    openai_output_price: 10.0,
    prompts: {} as PromptsConfig,
  });

  // Загрузка дефолтных промптов
  const loadDefaultPrompts = useCallback(async () => {
    if (defaultPrompts) return;
    setLoadingPrompts(true);
    try {
      const data = await searchConfigService.getDefaultPrompts();
      setDefaultPrompts(data);
    } catch (err) {
      console.error('Error loading default prompts:', err);
    } finally {
      setLoadingPrompts(false);
    }
  }, [defaultPrompts]);

  useEffect(() => {
    if (open) {
      setCurrentStep(1);
      setProviderResults(null);
      
      if (config) {
        setFormData({
          name: config.name,
          primary_provider: config.primary_provider,
          fallback_chain: config.fallback_chain,
          temperature: config.temperature,
          timeout: config.timeout,
          max_news_per_resource: config.max_news_per_resource,
          delay_between_requests: config.delay_between_requests,
          max_search_results: config.max_search_results,
          search_context_size: config.search_context_size,
          grok_model: config.grok_model,
          anthropic_model: config.anthropic_model,
          gemini_model: config.gemini_model,
          openai_model: config.openai_model,
          grok_input_price: config.grok_input_price,
          grok_output_price: config.grok_output_price,
          anthropic_input_price: config.anthropic_input_price,
          anthropic_output_price: config.anthropic_output_price,
          gemini_input_price: config.gemini_input_price,
          gemini_output_price: config.gemini_output_price,
          openai_input_price: config.openai_input_price,
          openai_output_price: config.openai_output_price,
          prompts: config.prompts || {},
        });
      } else {
        setFormData({
          name: '',
          primary_provider: 'grok',
          fallback_chain: [],
          temperature: 0.3,
          timeout: 120,
          max_news_per_resource: 10,
          delay_between_requests: 0.5,
          max_search_results: 5,
          search_context_size: 'low',
          grok_model: 'grok-4-1-fast',
          anthropic_model: 'claude-3-5-haiku-20241022',
          gemini_model: 'gemini-2.0-flash-exp',
          openai_model: 'gpt-4o',
          grok_input_price: 3.0,
          grok_output_price: 15.0,
          anthropic_input_price: 0.80,
          anthropic_output_price: 4.0,
          gemini_input_price: 0.075,
          gemini_output_price: 0.30,
          openai_input_price: 2.50,
          openai_output_price: 10.0,
          prompts: {},
        });
      }
    }
  }, [config, open]);

  // Загружаем промпты при переходе на шаг 3
  useEffect(() => {
    if (currentStep === 3) {
      loadDefaultPrompts();
    }
  }, [currentStep, loadDefaultPrompts]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Введите название конфигурации');
      return;
    }

    setSaving(true);
    try {
      if (isEdit && config) {
        await searchConfigService.updateConfiguration(config.id, formData);
        toast.success('Конфигурация обновлена');
      } else {
        await searchConfigService.createConfiguration(formData);
        toast.success('Конфигурация создана');
      }
      onSuccess();
    } catch (err: any) {
      console.error('Error saving configuration:', err);
      const errorMessage = err.response?.data?.detail || 'Ошибка сохранения конфигурации';
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const toggleFallback = (provider: string) => {
    const newChain = formData.fallback_chain.includes(provider)
      ? formData.fallback_chain.filter(p => p !== provider)
      : [...formData.fallback_chain, provider];
    setFormData({ ...formData, fallback_chain: newChain });
  };

  const handleCheckProviders = async () => {
    setCheckingProviders(true);
    setProviderResults(null);
    try {
      const allProviders = [formData.primary_provider, ...formData.fallback_chain] as Provider[];
      const uniqueProviders = [...new Set(allProviders)];
      const results = await searchConfigService.checkProviders(uniqueProviders);
      setProviderResults(results);
    } catch (err: any) {
      console.error('Error checking providers:', err);
      toast.error('Ошибка проверки провайдеров');
    } finally {
      setCheckingProviders(false);
    }
  };

  const handleResetPrompts = () => {
    if (defaultPrompts) {
      setFormData({ ...formData, prompts: { ...defaultPrompts } });
      toast.success('Промпты сброшены к стандартным');
    }
  };

  // Хелперы для работы с промптами
  const getPromptValue = (path: string): string => {
    const parts = path.split('.');
    let value: any = formData.prompts;
    for (const part of parts) {
      value = value?.[part];
    }
    if (value) return value;
    
    // Fallback на дефолтные
    let defaultValue: any = defaultPrompts;
    for (const part of parts) {
      defaultValue = defaultValue?.[part];
    }
    return defaultValue || '';
  };

  const setPromptValue = (path: string, value: string) => {
    const parts = path.split('.');
    const newPrompts = { ...formData.prompts } as any;
    
    let current = newPrompts;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      } else {
        current[parts[i]] = { ...current[parts[i]] };
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
    
    setFormData({ ...formData, prompts: newPrompts });
  };

  // Все выбранные провайдеры
  const selectedProviders = [formData.primary_provider, ...formData.fallback_chain.filter(p => p !== formData.primary_provider)];

  // Расчёт примерной стоимости
  const estimateCostPerRun = () => {
    const avgSourcesCount = 20;
    const avgInputTokens = 2000;
    const avgOutputTokens = 1000;
    
    const provider = formData.primary_provider;
    const inputPrice = (formData as any)[`${provider}_input_price`] || 0;
    const outputPrice = (formData as any)[`${provider}_output_price`] || 0;
    
    const costPerRequest = (avgInputTokens * inputPrice + avgOutputTokens * outputPrice) / 1_000_000;
    return costPerRequest * avgSourcesCount;
  };

  const handleNext = () => {
    if (currentStep === 1 && !formData.name.trim()) {
      toast.error('Введите название конфигурации');
      return;
    }
    if (currentStep < 5) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-6 h-6" />
            {isEdit ? 'Редактировать конфигурацию' : 'Создать конфигурацию'}
          </DialogTitle>
          <DialogDescription>
            Пошаговая настройка параметров автоматического поиска новостей
          </DialogDescription>
        </DialogHeader>

        {/* Степпер */}
        <div className="flex items-center gap-1 px-2 py-3">
          {WIZARD_STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = step.id === currentStep;
            const isCompleted = step.id < currentStep;
            
            return (
              <React.Fragment key={step.id}>
                <button
                  type="button"
                  onClick={() => setCurrentStep(step.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground font-medium'
                      : isCompleted
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                  tabIndex={0}
                  aria-label={`Шаг ${step.id}: ${step.title}`}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                  <span className="hidden md:inline">{step.title}</span>
                  <span className="md:hidden">{step.id}</span>
                </button>
                {index < WIZARD_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 ${isCompleted ? 'bg-green-400' : 'bg-muted'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Контент шагов */}
        <div className="flex-1 overflow-y-auto px-1 pb-2">
          {/* Шаг 1: Название и провайдеры */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <Label htmlFor="name">Название конфигурации *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Например: Production Config"
                  className="mt-2"
                />
              </div>

              <div>
                <Label className="text-base font-semibold">Основной провайдер</Label>
                <p className="text-sm text-muted-foreground mt-1 mb-3">
                  Выберите провайдер LLM, который будет использоваться для поиска новостей
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {PROVIDERS.map((provider) => (
                    <Card
                      key={provider.value}
                      className={`p-4 cursor-pointer transition-all ${
                        formData.primary_provider === provider.value
                          ? 'border-2 border-primary bg-primary/5 shadow-md'
                          : 'border hover:border-primary/50 hover:shadow-sm'
                      }`}
                      onClick={() => setFormData({ ...formData, primary_provider: provider.value })}
                      tabIndex={0}
                      role="radio"
                      aria-checked={formData.primary_provider === provider.value}
                      aria-label={provider.label}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setFormData({ ...formData, primary_provider: provider.value });
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-full ${PROVIDER_COLORS[provider.value]}`} />
                        <div>
                          <p className="font-medium text-sm">{provider.label}</p>
                          <p className="text-xs text-muted-foreground">{provider.description}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-base font-semibold">Резервные провайдеры</Label>
                <p className="text-sm text-muted-foreground mt-1 mb-3">
                  Провайдеры для fallback при ошибках основного (порядок имеет значение)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {PROVIDERS.filter(p => p.value !== formData.primary_provider).map((provider) => (
                    <Card
                      key={provider.value}
                      className={`p-3 cursor-pointer transition-all ${
                        formData.fallback_chain.includes(provider.value)
                          ? 'border-2 border-primary bg-primary/10'
                          : 'border hover:border-primary/50'
                      }`}
                      onClick={() => toggleFallback(provider.value)}
                      tabIndex={0}
                      role="checkbox"
                      aria-checked={formData.fallback_chain.includes(provider.value)}
                      aria-label={`Резервный: ${provider.label}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleFallback(provider.value);
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${PROVIDER_COLORS[provider.value]}`} />
                        <span className="text-sm">{provider.label}</span>
                        {formData.fallback_chain.includes(provider.value) && (
                          <Badge variant="secondary" className="ml-auto text-xs">
                            #{formData.fallback_chain.indexOf(provider.value) + 1}
                          </Badge>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Шаг 2: Модели и параметры */}
          {currentStep === 2 && (
            <div className="space-y-6">
              {/* Модели для выбранных провайдеров */}
              <div>
                <Label className="text-base font-semibold">Модели LLM</Label>
                <p className="text-sm text-muted-foreground mt-1 mb-3">
                  Какую модель использовать для каждого провайдера
                </p>
                <div className="space-y-3">
                  {selectedProviders.map((provider) => (
                    <div key={provider} className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${PROVIDER_COLORS[provider]}`} />
                      <Label className="w-24 flex-shrink-0 text-sm">{PROVIDERS.find(p => p.value === provider)?.label?.split(' ')[0]}</Label>
                      <Input
                        value={(formData as any)[`${provider}_model`]}
                        onChange={(e) => setFormData({ ...formData, [`${provider}_model`]: e.target.value })}
                        className="flex-1"
                        placeholder={`Модель для ${provider}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Температура */}
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="temperature">Температура</Label>
                  <span className="text-sm font-mono text-muted-foreground">{formData.temperature}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Чем выше — тем более разнообразные результаты (0.0 - 1.0)
                </p>
                <Slider
                  value={[formData.temperature]}
                  onValueChange={([val]) => setFormData({ ...formData, temperature: Math.round(val * 10) / 10 })}
                  min={0}
                  max={1}
                  step={0.1}
                  className="mt-2"
                />
              </div>

              {/* Таймаут */}
              <div>
                <Label htmlFor="timeout">Таймаут (секунды)</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Сколько секунд ждать ответа от модели
                </p>
                <Input
                  id="timeout"
                  type="number"
                  min={30}
                  max={300}
                  value={formData.timeout}
                  onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) || 120 })}
                />
              </div>

              {/* Max news per resource */}
              <div>
                <Label htmlFor="max_news">Макс. новостей с источника</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Сколько новостей брать с одного сайта за один поиск
                </p>
                <Input
                  id="max_news"
                  type="number"
                  min={1}
                  max={50}
                  value={formData.max_news_per_resource}
                  onChange={(e) => setFormData({ ...formData, max_news_per_resource: parseInt(e.target.value) || 10 })}
                />
              </div>

              {/* Задержка */}
              <div>
                <Label htmlFor="delay">Задержка между запросами (сек)</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Пауза между запросами, чтобы не перегрузить сервис
                </p>
                <Input
                  id="delay"
                  type="number"
                  step={0.1}
                  min={0}
                  max={10}
                  value={formData.delay_between_requests}
                  onChange={(e) => setFormData({ ...formData, delay_between_requests: parseFloat(e.target.value) || 0.5 })}
                />
              </div>

              {/* Grok web search параметры */}
              {selectedProviders.includes('grok') && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Zap className="w-4 h-4 text-purple-500" />
                      Grok Web Search
                    </Label>
                    <Card className="p-3 bg-amber-50 dark:bg-amber-950/20 border-amber-200 mt-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          max_search_results критически влияет на стоимость. Рекомендуется 3-5.
                        </p>
                      </div>
                    </Card>
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div>
                        <Label htmlFor="max_search_results">Max Search Results</Label>
                        <Input
                          id="max_search_results"
                          type="number"
                          min={1}
                          max={20}
                          value={formData.max_search_results}
                          onChange={(e) => setFormData({ ...formData, max_search_results: parseInt(e.target.value) || 5 })}
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label htmlFor="search_context_size">Context Size</Label>
                        <Select
                          value={formData.search_context_size}
                          onValueChange={(value: SearchContextSize) => setFormData({ ...formData, search_context_size: value })}
                        >
                          <SelectTrigger id="search_context_size" className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONTEXT_SIZES.map((size) => (
                              <SelectItem key={size.value} value={size.value}>
                                {size.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Шаг 3: Промпты */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-semibold">Настройка промптов</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Пустые поля означают "использовать стандартные промпты"
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetPrompts}
                  disabled={loadingPrompts || !defaultPrompts}
                  className="flex items-center gap-2"
                >
                  <RotateCcw className="w-3 h-3" />
                  Сбросить к стандартным
                </Button>
              </div>

              {loadingPrompts ? (
                <Card className="p-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Загрузка промптов...</p>
                </Card>
              ) : (
                <Accordion type="multiple" defaultValue={['system']} className="space-y-2">
                  {/* Системные промпты */}
                  <AccordionItem value="system" className="border rounded-lg">
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4" />
                        <span>Системные промпты</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      <p className="text-xs text-muted-foreground">
                        Вступительная инструкция для модели. Задаёт роль и контекст. Переменные: {'{current_date}'}
                      </p>
                      {selectedProviders.map((provider) => (
                        <div key={provider}>
                          <Label className="flex items-center gap-2 mb-2">
                            <div className={`w-2 h-2 rounded-full ${PROVIDER_COLORS[provider]}`} />
                            {PROVIDERS.find(p => p.value === provider)?.label}
                          </Label>
                          <Textarea
                            value={getPromptValue(`system_prompts.${provider}`)}
                            onChange={(e) => setPromptValue(`system_prompts.${provider}`, e.target.value)}
                            placeholder="Оставьте пустым для стандартного промпта"
                            rows={3}
                            className="font-mono text-xs"
                          />
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>

                  {/* Шаблоны поиска по языкам */}
                  <AccordionItem value="search" className="border rounded-lg">
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        <span>Шаблоны поиска по языкам</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <p className="text-xs text-muted-foreground mb-3">
                        Что именно модель будет искать на сайтах каждого языка. Переменные: {'{url}'}, {'{name}'}, {'{start_date}'}, {'{end_date}'}
                      </p>
                      <Tabs value={promptLangTab} onValueChange={setPromptLangTab}>
                        <TabsList className="mb-3">
                          {LANGUAGES.map((lang) => (
                            <TabsTrigger key={lang.code} value={lang.code} className="text-xs">
                              {lang.label}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                        {LANGUAGES.map((lang) => (
                          <TabsContent key={lang.code} value={lang.code} className="space-y-3">
                            <div>
                              <Label className="text-xs">Основной промпт</Label>
                              <Textarea
                                value={getPromptValue(`search_prompts.${lang.code}.main`)}
                                onChange={(e) => setPromptValue(`search_prompts.${lang.code}.main`, e.target.value)}
                                placeholder="Оставьте пустым для стандартного"
                                rows={4}
                                className="mt-1 font-mono text-xs"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Формат ответа (JSON)</Label>
                              <Textarea
                                value={getPromptValue(`search_prompts.${lang.code}.json_format`)}
                                onChange={(e) => setPromptValue(`search_prompts.${lang.code}.json_format`, e.target.value)}
                                placeholder="Оставьте пустым для стандартного"
                                rows={4}
                                className="mt-1 font-mono text-xs"
                              />
                            </div>
                          </TabsContent>
                        ))}
                      </Tabs>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Промпты для производителей */}
                  <AccordionItem value="manufacturer" className="border rounded-lg">
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Factory className="w-4 h-4" />
                        <span>Промпты для производителей</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-4">
                      <p className="text-xs text-muted-foreground">
                        Как искать новости по конкретным производителям. Переменные: {'{manufacturer_name}'}, {'{start_date}'}, {'{end_date}'}, {'{websites}'}, {'{json_format}'}
                      </p>
                      <div>
                        <Label className="text-xs">С указанными сайтами</Label>
                        <Textarea
                          value={getPromptValue('manufacturer_prompts.with_websites')}
                          onChange={(e) => setPromptValue('manufacturer_prompts.with_websites', e.target.value)}
                          placeholder="Оставьте пустым для стандартного"
                          rows={4}
                          className="mt-1 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Без сайтов</Label>
                        <Textarea
                          value={getPromptValue('manufacturer_prompts.without_websites')}
                          onChange={(e) => setPromptValue('manufacturer_prompts.without_websites', e.target.value)}
                          placeholder="Оставьте пустым для стандартного"
                          rows={4}
                          className="mt-1 font-mono text-xs"
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>
          )}

          {/* Шаг 4: Стоимость */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <Label className="text-base font-semibold">Тарифы за 1М токенов (USD)</Label>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Цены используются для расчёта стоимости поиска
                </p>
                <div className="space-y-4">
                  {selectedProviders.map((provider) => {
                    const providerInfo = PROVIDERS.find(p => p.value === provider);
                    return (
                      <Card key={provider} className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className={`w-3 h-3 rounded-full ${PROVIDER_COLORS[provider]}`} />
                          <span className="font-medium text-sm">{providerInfo?.label}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Input (за 1М)</Label>
                            <Input
                              type="number"
                              step={0.01}
                              value={(formData as any)[`${provider}_input_price`]}
                              onChange={(e) => setFormData({ ...formData, [`${provider}_input_price`]: parseFloat(e.target.value) || 0 })}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Output (за 1М)</Label>
                            <Input
                              type="number"
                              step={0.01}
                              value={(formData as any)[`${provider}_output_price`]}
                              onChange={(e) => setFormData({ ...formData, [`${provider}_output_price`]: parseFloat(e.target.value) || 0 })}
                              className="mt-1"
                            />
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Расчёт примерной стоимости */}
              <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm text-blue-900 dark:text-blue-100">
                      Примерная стоимость одного запуска
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                      ~20 источников x ~2000 input + ~1000 output токенов
                    </p>
                    <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-2">
                      ~${estimateCostPerRun().toFixed(4)}
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Шаг 5: Проверка и сохранение */}
          {currentStep === 5 && (
            <div className="space-y-6">
              {/* Сводка настроек */}
              <Card className="p-4">
                <Label className="text-base font-semibold">Сводка конфигурации</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Название</p>
                    <p className="font-medium text-sm mt-1">{formData.name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Основной провайдер</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className={`w-2 h-2 rounded-full ${PROVIDER_COLORS[formData.primary_provider]}`} />
                      <p className="font-medium text-sm">
                        {PROVIDERS.find(p => p.value === formData.primary_provider)?.label}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Резервные</p>
                    <p className="font-medium text-sm mt-1">
                      {formData.fallback_chain.length > 0
                        ? formData.fallback_chain.map(p => PROVIDERS.find(pr => pr.value === p)?.label?.split(' ')[0]).join(', ')
                        : 'Нет'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Температура</p>
                    <p className="font-medium text-sm mt-1">{formData.temperature}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Таймаут</p>
                    <p className="font-medium text-sm mt-1">{formData.timeout}с</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Max News/Resource</p>
                    <p className="font-medium text-sm mt-1">{formData.max_news_per_resource}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Промпты</p>
                    <p className="font-medium text-sm mt-1">
                      {Object.keys(formData.prompts).length > 0 ? 'Кастомные' : 'Стандартные'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Примерная стоимость</p>
                    <p className="font-medium text-sm mt-1">~${estimateCostPerRun().toFixed(4)}/запуск</p>
                  </div>
                </div>
              </Card>

              {/* Проверка провайдеров */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <Label className="text-base font-semibold">Проверка провайдеров</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCheckProviders}
                    disabled={checkingProviders}
                    className="flex items-center gap-2"
                  >
                    {checkingProviders ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Shield className="w-3 h-3" />
                    )}
                    {checkingProviders ? 'Проверка...' : 'Проверить провайдеров'}
                  </Button>
                </div>

                {providerResults ? (
                  <div className="space-y-3">
                    {Object.entries(providerResults).map(([provider, result]) => (
                      <div key={provider} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <div className={`w-3 h-3 rounded-full ${PROVIDER_COLORS[provider]}`} />
                        <span className="font-medium text-sm flex-1">
                          {PROVIDERS.find(p => p.value === provider)?.label}
                        </span>
                        {result.available ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            <span className="text-sm text-green-700 dark:text-green-400">Работает</span>
                            {result.balance !== null && (
                              <Badge variant="secondary" className="text-xs">
                                ${result.balance}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-500" />
                            <span className="text-sm text-red-700 dark:text-red-400">
                              {result.error || 'Недоступен'}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Нажмите "Проверить провайдеров" для проверки доступности API ключей
                  </p>
                )}
              </Card>
            </div>
          )}
        </div>

        {/* Навигация */}
        <DialogFooter className="flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {currentStep > 1 && (
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Назад
              </Button>
            )}
            {currentStep < 5 ? (
              <Button
                onClick={handleNext}
                className="flex items-center gap-1"
              >
                Далее
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
