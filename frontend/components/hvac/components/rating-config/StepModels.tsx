import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Zap, Crown } from 'lucide-react';
import { MODEL_OPTIONS, PROVIDERS, PROVIDER_COLORS, type RatingConfigFormData } from './constants';

interface StepModelsProps {
  formData: RatingConfigFormData;
  onChange: (data: RatingConfigFormData) => void;
  selectedProviders: string[];
}

export function StepModels({ formData, onChange, selectedProviders }: StepModelsProps) {
  const selectModel = (provider: string, modelId: string) => {
    const modelKey = `${provider}_model` as keyof RatingConfigFormData;
    const model = MODEL_OPTIONS[provider]?.find(m => m.id === modelId);
    if (!model) return;

    onChange({
      ...formData,
      [modelKey]: modelId,
      [`${provider}_input_price`]: model.input,
      [`${provider}_output_price`]: model.output,
    } as RatingConfigFormData);
  };

  return (
    <div className="space-y-6">
      {/* Модели для каждого провайдера */}
      {selectedProviders.map(provider => {
        const providerInfo = PROVIDERS.find(p => p.value === provider);
        const models = MODEL_OPTIONS[provider] || [];
        const currentModel = formData[`${provider}_model` as keyof RatingConfigFormData] as string;

        return (
          <div key={provider}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-3 h-3 rounded-full ${PROVIDER_COLORS[provider]}`} />
              <Label className="text-base">{providerInfo?.label || provider}</Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {models.map(model => {
                const isSelected = currentModel === model.id;
                const isCheap = model.tier === 'cheap';

                return (
                  <Card
                    key={model.id}
                    className={`p-4 cursor-pointer transition-all hover:shadow-md ${
                      isSelected
                        ? isCheap
                          ? 'ring-2 ring-green-500 border-green-500 bg-green-50/50 dark:bg-green-950/20'
                          : 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                        : 'hover:border-primary/50'
                    }`}
                    onClick={() => selectModel(provider, model.id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {isCheap
                          ? <Zap className="w-4 h-4 text-green-600" />
                          : <Crown className="w-4 h-4 text-blue-600" />
                        }
                        <span className="font-medium text-sm">{model.label}</span>
                      </div>
                      <Badge variant={isCheap ? 'secondary' : 'default'} className="text-xs">
                        {isCheap ? 'Экономный' : 'Мощный'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{model.description}</p>
                    <div className="text-xs font-mono text-muted-foreground">
                      ${model.input} / ${model.output} за 1M токенов
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Параметры */}
      <div className="border-t pt-4 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Температура ({formData.temperature})</Label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={formData.temperature}
              onChange={e => onChange({ ...formData, temperature: parseFloat(e.target.value) })}
              className="w-full mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">Ниже = точнее, выше = креативнее</p>
          </div>
          <div>
            <Label>Размер батча</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={formData.batch_size}
              onChange={e => onChange({ ...formData, batch_size: parseInt(e.target.value) || 10 })}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Новостей за один запрос к LLM</p>
          </div>
          <div>
            <Label>Порог дубликатов ({formData.duplicate_similarity_threshold})</Label>
            <input
              type="range"
              min="0.5"
              max="0.95"
              step="0.05"
              value={formData.duplicate_similarity_threshold}
              onChange={e => onChange({ ...formData, duplicate_similarity_threshold: parseFloat(e.target.value) })}
              className="w-full mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">Выше = строже детекция</p>
          </div>
        </div>
      </div>
    </div>
  );
}
