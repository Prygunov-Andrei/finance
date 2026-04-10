import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { type RatingConfigFormData } from './constants';

const DEFAULT_SYSTEM_PROMPT =
  'Ты — эксперт по HVAC-индустрии (вентиляция, кондиционирование, холодоснабжение, ' +
  'тепловые насосы). Твоя задача — оценить новости по шкале 0-5 звёзд.';

const DEFAULT_RATING_PROMPT =
  'Оцени каждую новость по следующим критериям.\n\n' +
  'КРИТЕРИИ ОЦЕНКИ:\n{criteria}\n\n' +
  'ВАЖНЫЕ ПРАВИЛА:\n' +
  '- Если новость не подходит ни под один критерий → 0 звёзд\n' +
  '- Если подходит под несколько критериев разных уровней, используй НАИВЫСШИЙ рейтинг\n' +
  '- Если есть дочерний критерий с override — используй его рейтинг\n\n' +
  'НОВОСТИ ДЛЯ ОЦЕНКИ:\n[{news_items}]\n\n' +
  'Верни СТРОГО JSON: {{"ratings": [{{"news_id": <id>, "star_rating": <0-5>, ' +
  '"explanation": "<почему>", "matched_criteria": [<ids>]}}]}}';

interface StepPromptsProps {
  formData: RatingConfigFormData;
  onChange: (data: RatingConfigFormData) => void;
}

export function StepPrompts({ formData, onChange }: StepPromptsProps) {
  const prompts = formData.prompts || {};

  const updatePrompt = (key: string, value: string) => {
    onChange({ ...formData, prompts: { ...prompts, [key]: value } });
  };

  const resetPrompt = (key: string, defaultValue: string) => {
    onChange({ ...formData, prompts: { ...prompts, [key]: defaultValue } });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Промпты определяют, как LLM будет оценивать новости.
        Переменные <code>{'{criteria}'}</code> и <code>{'{news_items}'}</code> подставляются автоматически.
      </p>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Системный промпт</Label>
          <Button variant="ghost" size="sm" onClick={() => resetPrompt('system_prompt', DEFAULT_SYSTEM_PROMPT)}>
            <RotateCcw className="w-3 h-3 mr-1" /> По умолчанию
          </Button>
        </div>
        <Textarea
          value={prompts.system_prompt || DEFAULT_SYSTEM_PROMPT}
          onChange={e => updatePrompt('system_prompt', e.target.value)}
          rows={3}
          placeholder={DEFAULT_SYSTEM_PROMPT}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Промпт рейтинга</Label>
          <Button variant="ghost" size="sm" onClick={() => resetPrompt('rating_prompt', DEFAULT_RATING_PROMPT)}>
            <RotateCcw className="w-3 h-3 mr-1" /> По умолчанию
          </Button>
        </div>
        <Textarea
          value={prompts.rating_prompt || DEFAULT_RATING_PROMPT}
          onChange={e => updatePrompt('rating_prompt', e.target.value)}
          rows={12}
          className="font-mono text-xs"
          placeholder={DEFAULT_RATING_PROMPT}
        />
      </div>
    </div>
  );
}
