import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, LLMProvider, LLMTaskConfig } from '@/lib/api';
import { CONSTANTS } from '@/constants';
import { Loader2, Check, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

export function LLMSettings() {
  const queryClient = useQueryClient();

  const { data: providers, isLoading } = useQuery({
    queryKey: ['llm-providers'],
    queryFn: () => api.core.getLLMProviders(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: taskConfigs } = useQuery({
    queryKey: ['llm-task-configs'],
    queryFn: () => api.core.getLLMTaskConfigs(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) => api.core.setDefaultLLMProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
      toast.success('Провайдер по умолчанию изменён');
    },
    onError: (error: Error) => toast.error(`Ошибка: ${error.message}`),
  });

  const updateTaskConfigMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { provider?: number | null } }) =>
      api.core.updateLLMTaskConfig(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-task-configs'] });
      toast.success('Настройка задачи обновлена');
    },
    onError: (error: Error) => toast.error(`Ошибка: ${error.message}`),
  });

  const getProviderIcon = (type: string) => {
    switch (type) {
      case 'openai': return '🤖';
      case 'gemini': return '✨';
      case 'grok': return '⚡';
      case 'local': return '🏠';
      default: return '🔮';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const activeProviders = providers?.filter((p) => p.is_active) || [];
  const defaultProvider = providers?.find((p) => p.is_default);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl mb-1">Настройки LLM</h1>
        <p className="text-muted-foreground text-sm">
          Управление провайдерами и назначение задач
        </p>
      </div>

      <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-lg">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium mb-1">
              API-ключи настраиваются в переменных окружения сервера
            </p>
            <p className="text-xs text-muted-foreground">
              Каждая задача может использовать свой провайдер. Если не задан — используется провайдер по умолчанию.
            </p>
          </div>
        </div>
      </div>

      {/* Provider Cards */}
      {!providers || providers.length === 0 ? (
        <Card className="p-12 text-center">
          <Sparkles className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">Провайдеры не найдены</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {providers.map((provider) => (
            <Card key={provider.id} className="p-6 relative">
              {provider.is_default && (
                <div className="absolute top-4 right-4">
                  <Badge className="bg-blue-600 text-white flex items-center gap-1">
                    <Check className="w-3 h-3" /> По умолчанию
                  </Badge>
                </div>
              )}
              <div className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{getProviderIcon(provider.provider_type)}</span>
                  <div>
                    <h3 className="font-semibold text-lg">{provider.provider_type_display}</h3>
                    <p className="text-xs text-muted-foreground">{provider.model_name}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Статус:</span>
                  <Badge className={provider.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-muted text-foreground'}>
                    {provider.is_active ? 'Активен' : 'Неактивен'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Переменная:</span>
                  <code className="text-xs bg-muted px-2 py-1 rounded">{provider.env_key_name}</code>
                </div>
              </div>
              {!provider.is_default && provider.is_active && (
                <Button onClick={() => setDefaultMutation.mutate(provider.id)} disabled={setDefaultMutation.isPending} variant="outline" className="w-full" size="sm">
                  {setDefaultMutation.isPending ? <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Установка...</> : 'Сделать по умолчанию'}
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Task Config Table with Dropdowns */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Настройка задач</h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Задача</th>
                <th className="text-left px-4 py-2 font-medium">Провайдер</th>
                <th className="text-left px-4 py-2 font-medium w-24">Статус</th>
              </tr>
            </thead>
            <tbody>
              {(taskConfigs || []).map((config) => {
                const hasSpecific = config.provider !== null;
                return (
                  <tr key={config.id} className="border-t">
                    <td className="px-4 py-2.5">{config.task_type_display}</td>
                    <td className="px-4 py-2.5">
                      <Select
                        value={config.provider !== null ? String(config.provider) : 'default'}
                        onValueChange={(val) => {
                          const providerId = val === 'default' ? null : Number(val);
                          updateTaskConfigMutation.mutate({ id: config.id, data: { provider: providerId } });
                        }}
                      >
                        <SelectTrigger className="h-8 w-[240px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">
                            {defaultProvider ? `${defaultProvider.provider_type_display} (по умолч.)` : 'По умолчанию'}
                          </SelectItem>
                          {activeProviders.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {getProviderIcon(p.provider_type)} {p.provider_type_display}: {p.model_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2.5">
                      {hasSpecific ? (
                        <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs">
                          настроен
                        </Badge>
                      ) : (
                        <Badge className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs">
                          fallback
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 p-4 bg-muted border border-border rounded-lg">
        <h3 className="text-sm font-medium mb-2">Как работает система?</h3>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li>Каждая задача может использовать свой LLM-провайдер</li>
          <li>Подбор работ использует 8-уровневый pipeline (история, прайс, знания, fuzzy, LLM, web)</li>
          <li>Web search работает через Gemini Google Search Grounding</li>
          <li>В будущем поддерживаются локальные LLM для приватных данных</li>
        </ul>
      </div>
    </div>
  );
}
