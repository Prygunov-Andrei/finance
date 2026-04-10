import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { PROVIDERS, PROVIDER_COLORS, type RatingConfigFormData } from './constants';

interface StepCostProps {
  formData: RatingConfigFormData;
  onChange: (data: RatingConfigFormData) => void;
  selectedProviders: string[];
  estimatedCost: number;
}

export function StepCost({ formData, onChange, selectedProviders, estimatedCost }: StepCostProps) {
  const updatePrice = (field: string, value: string) => {
    onChange({ ...formData, [field]: parseFloat(value) || 0 } as RatingConfigFormData);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Цены за 1 миллион токенов в USD. Заполняются автоматически при выборе модели.
      </p>

      {selectedProviders.map(provider => {
        const providerInfo = PROVIDERS.find(p => p.value === provider);
        const inputKey = `${provider}_input_price`;
        const outputKey = `${provider}_output_price`;

        return (
          <Card key={provider} className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-3 h-3 rounded-full ${PROVIDER_COLORS[provider]}`} />
              <Label className="text-base">{providerInfo?.label || provider}</Label>
              <span className="text-xs text-muted-foreground ml-auto">
                {formData[`${provider}_model` as keyof RatingConfigFormData] as string}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Input ($/1M tokens)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData[inputKey as keyof RatingConfigFormData] as number}
                  onChange={e => updatePrice(inputKey, e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Output ($/1M tokens)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData[outputKey as keyof RatingConfigFormData] as number}
                  onChange={e => updatePrice(outputKey, e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </Card>
        );
      })}

      <Card className="p-4 border-primary/50 bg-primary/5">
        <div className="text-sm font-medium">Примерная стоимость одного запуска рейтинга</div>
        <div className="text-2xl font-bold mt-1">${estimatedCost.toFixed(4)}</div>
        <div className="text-xs text-muted-foreground mt-1">
          Для ~500 новостей, батч по {formData.batch_size}, основной провайдер
        </div>
      </Card>
    </div>
  );
}
