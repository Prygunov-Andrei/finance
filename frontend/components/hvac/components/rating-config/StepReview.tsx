import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, Shield } from 'lucide-react';
import { PROVIDERS, PROVIDER_COLORS, type RatingConfigFormData } from './constants';
import type { ProviderCheckResults } from '../../services/searchConfigService';

interface StepReviewProps {
  formData: RatingConfigFormData;
  estimatedCost: number;
  checkingProviders: boolean;
  providerResults: ProviderCheckResults | null;
  onCheckProviders: () => void;
}

export function StepReview({ formData, estimatedCost, checkingProviders, providerResults, onCheckProviders }: StepReviewProps) {
  const allProviders = [formData.primary_provider, ...formData.fallback_chain];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="text-sm font-medium mb-2">Конфигурация</div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-muted-foreground">Название:</div>
          <div className="font-medium">{formData.name || '(не указано)'}</div>
          <div className="text-muted-foreground">Основной провайдер:</div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${PROVIDER_COLORS[formData.primary_provider]}`} />
            {PROVIDERS.find(p => p.value === formData.primary_provider)?.label}
          </div>
          <div className="text-muted-foreground">Модель:</div>
          <div className="font-mono text-xs">{formData[`${formData.primary_provider}_model` as keyof RatingConfigFormData] as string}</div>
          <div className="text-muted-foreground">Fallback:</div>
          <div>{formData.fallback_chain.length > 0 ? formData.fallback_chain.join(' → ') : 'нет'}</div>
          <div className="text-muted-foreground">Температура:</div>
          <div>{formData.temperature}</div>
          <div className="text-muted-foreground">Размер батча:</div>
          <div>{formData.batch_size}</div>
          <div className="text-muted-foreground">Порог дубликатов:</div>
          <div>{formData.duplicate_similarity_threshold}</div>
          <div className="text-muted-foreground">Стоимость ~500 новостей:</div>
          <div className="font-bold">${estimatedCost.toFixed(4)}</div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium flex items-center gap-2">
            <Shield className="w-4 h-4" /> Проверка провайдеров
          </div>
          <Button variant="outline" size="sm" onClick={onCheckProviders} disabled={checkingProviders}>
            {checkingProviders ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Проверить
          </Button>
        </div>

        {providerResults ? (
          <div className="space-y-2">
            {allProviders.map(provider => {
              const result = providerResults[provider as keyof ProviderCheckResults];
              const providerInfo = PROVIDERS.find(p => p.value === provider);
              return (
                <div key={provider} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${PROVIDER_COLORS[provider]}`} />
                    <span className="text-sm">{providerInfo?.label}</span>
                  </div>
                  {result?.available ? (
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> OK
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <XCircle className="w-3 h-3 mr-1" /> {result?.error || 'Недоступен'}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Нажмите "Проверить" чтобы убедиться, что API ключи настроены и провайдеры доступны.
          </p>
        )}
      </Card>
    </div>
  );
}
