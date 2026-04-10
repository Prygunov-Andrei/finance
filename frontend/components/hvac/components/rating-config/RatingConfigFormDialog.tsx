import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Star, ChevronLeft, ChevronRight, Check, Loader2, Save } from 'lucide-react';
import ratingService, {
  RatingConfiguration,
} from '../../services/ratingService';
import type { ProviderCheckResults, Provider } from '../../services/searchConfigService';
import searchConfigService from '../../services/searchConfigService';
import { toast } from 'sonner';
import { WIZARD_STEPS, DEFAULT_FORM_DATA, type RatingConfigFormData } from './constants';
import { StepProviders } from './StepProviders';
import { StepModels } from './StepModels';
import { StepPrompts } from './StepPrompts';
import { StepCost } from './StepCost';
import { StepReview } from './StepReview';

interface RatingConfigFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: RatingConfiguration | null;
  onSuccess: () => void;
}

export default function RatingConfigFormDialog({
  open,
  onOpenChange,
  config,
  onSuccess,
}: RatingConfigFormDialogProps) {
  const isEdit = config !== null;
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [checkingProviders, setCheckingProviders] = useState(false);
  const [providerResults, setProviderResults] = useState<ProviderCheckResults | null>(null);
  const [formData, setFormData] = useState<RatingConfigFormData>({ ...DEFAULT_FORM_DATA });

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
          batch_size: config.batch_size,
          duplicate_similarity_threshold: config.duplicate_similarity_threshold,
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
        setFormData({ ...DEFAULT_FORM_DATA });
      }
    }
  }, [config, open]);

  const selectedProviders = [formData.primary_provider, ...formData.fallback_chain.filter(p => p !== formData.primary_provider)];

  const estimateCostPerRun = () => {
    const newsCount = 500;
    const avgInputTokens = 3000;
    const avgOutputTokens = 1500;
    const batchCount = Math.ceil(newsCount / formData.batch_size);
    const provider = formData.primary_provider;
    const inputPrice = (formData[`${provider}_input_price` as keyof RatingConfigFormData] as number) || 0;
    const outputPrice = (formData[`${provider}_output_price` as keyof RatingConfigFormData] as number) || 0;
    const costPerBatch = (avgInputTokens * inputPrice + avgOutputTokens * outputPrice) / 1_000_000;
    return costPerBatch * batchCount;
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { toast.error('Введите название конфигурации'); return; }
    setSaving(true);
    try {
      if (isEdit && config) {
        await ratingService.updateConfiguration(config.id, formData as Partial<RatingConfiguration>);
        toast.success('Конфигурация обновлена');
      } else {
        await ratingService.createConfiguration(formData as Partial<RatingConfiguration>);
        toast.success('Конфигурация создана');
      }
      onSuccess();
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? (err.response?.data as Record<string, string> | undefined)?.detail ?? 'Ошибка сохранения'
        : 'Ошибка сохранения';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleCheckProviders = async () => {
    setCheckingProviders(true);
    setProviderResults(null);
    try {
      const allProviders = [...new Set([formData.primary_provider, ...formData.fallback_chain])] as Provider[];
      const results = await searchConfigService.checkProviders(allProviders);
      setProviderResults(results);
    } catch {
      toast.error('Ошибка проверки провайдеров');
    } finally {
      setCheckingProviders(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && !formData.name.trim()) { toast.error('Введите название'); return; }
    if (currentStep < 5) setCurrentStep(currentStep + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-6 h-6" />
            {isEdit ? 'Редактировать конфигурацию рейтинга' : 'Создать конфигурацию рейтинга'}
          </DialogTitle>
          <DialogDescription>Настройка провайдера, модели и параметров AI-рейтинга новостей</DialogDescription>
        </DialogHeader>

        {/* Stepper */}
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
                    isActive ? 'bg-primary text-primary-foreground font-medium'
                    : isCompleted ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
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

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-1 pb-2">
          {currentStep === 1 && <StepProviders formData={formData} onChange={setFormData} />}
          {currentStep === 2 && <StepModels formData={formData} onChange={setFormData} selectedProviders={selectedProviders} />}
          {currentStep === 3 && <StepPrompts formData={formData} onChange={setFormData} />}
          {currentStep === 4 && <StepCost formData={formData} onChange={setFormData} selectedProviders={selectedProviders} estimatedCost={estimateCostPerRun()} />}
          {currentStep === 5 && <StepReview formData={formData} estimatedCost={estimateCostPerRun()} checkingProviders={checkingProviders} providerResults={providerResults} onCheckProviders={handleCheckProviders} />}
        </div>

        {/* Navigation */}
        <DialogFooter className="flex items-center justify-between border-t pt-4">
          <div><Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button></div>
          <div className="flex items-center gap-2">
            {currentStep > 1 && (
              <Button variant="outline" onClick={() => setCurrentStep(currentStep - 1)}>
                <ChevronLeft className="w-4 h-4 mr-1" />Назад
              </Button>
            )}
            {currentStep < 5 ? (
              <Button onClick={handleNext}>Далее<ChevronRight className="w-4 h-4 ml-1" /></Button>
            ) : (
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
