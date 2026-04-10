import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PROVIDERS, PROVIDER_COLORS, type RatingConfigFormData } from './constants';
import type { Provider } from '../../services/searchConfigService';

interface StepProvidersProps {
  formData: RatingConfigFormData;
  onChange: (data: RatingConfigFormData) => void;
}

export function StepProviders({ formData, onChange }: StepProvidersProps) {
  const toggleFallback = (provider: Provider) => {
    if (provider === formData.primary_provider) return;
    const chain = formData.fallback_chain.includes(provider)
      ? formData.fallback_chain.filter(p => p !== provider)
      : [...formData.fallback_chain, provider];
    onChange({ ...formData, fallback_chain: chain });
  };

  return (
    <div className="space-y-6">
      <div>
        <Label>Название конфигурации</Label>
        <Input
          value={formData.name}
          onChange={e => onChange({ ...formData, name: e.target.value })}
          placeholder="Например: Grok Fast Rating"
          className="mt-1"
        />
      </div>

      <div>
        <Label className="mb-3 block">Основной провайдер</Label>
        <div className="grid grid-cols-2 gap-3">
          {PROVIDERS.map(p => (
            <Card
              key={p.value}
              className={`p-4 cursor-pointer transition-all hover:shadow-md ${
                formData.primary_provider === p.value
                  ? 'ring-2 ring-primary border-primary'
                  : 'hover:border-primary/50'
              }`}
              onClick={() => onChange({
                ...formData,
                primary_provider: p.value,
                fallback_chain: formData.fallback_chain.filter(f => f !== p.value),
              })}
            >
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${PROVIDER_COLORS[p.value]}`} />
                <div>
                  <div className="font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.description}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-3 block">Резервные провайдеры (fallback chain)</Label>
        <div className="flex gap-2 flex-wrap">
          {PROVIDERS.filter(p => p.value !== formData.primary_provider).map(p => (
            <button
              key={p.value}
              onClick={() => toggleFallback(p.value)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                formData.fallback_chain.includes(p.value)
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${PROVIDER_COLORS[p.value]}`} />
              {p.label}
              {formData.fallback_chain.includes(p.value) && (
                <Badge variant="secondary" className="text-xs">
                  #{formData.fallback_chain.indexOf(p.value) + 1}
                </Badge>
              )}
            </button>
          ))}
        </div>
        {formData.fallback_chain.length === 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Без резервных провайдеров. Если основной недоступен — рейтинг не выполнится.
          </p>
        )}
      </div>
    </div>
  );
}
