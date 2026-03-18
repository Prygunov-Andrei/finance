import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, LLMProvider } from '../lib/api';
import { CONSTANTS } from '../constants';
import { Loader2, Check, Sparkles } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { toast } from 'sonner';

export function LLMSettings() {
  const queryClient = useQueryClient();

  const { data: providers, isLoading } = useQuery({
    queryKey: ['llm-providers'],
    queryFn: () => api.getLLMProviders(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) => api.setDefaultLLMProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
      toast.success('Провайдер по умолчанию изменён');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const getProviderIcon = (type: string) => {
    switch (type) {
      case 'openai':
        return '🤖';
      case 'gemini':
        return '✨';
      case 'grok':
        return '⚡';
      default:
        return '🔮';
    }
  };

  const getProviderColor = (type: string) => {
    switch (type) {
      case 'openai':
        return 'bg-green-100 text-green-700';
      case 'gemini':
        return 'bg-blue-100 text-blue-700';
      case 'grok':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl mb-1">Настройки LLM</h1>
        <p className="text-gray-500 text-sm">
          Управление провайдерами для парсинга PDF-счетов
        </p>
      </div>

      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-blue-900 font-medium mb-1">
              Важно: API-ключи настраиваются в переменных окружения сервера
            </p>
            <p className="text-xs text-blue-700">
              Провайдеры с активными ключами отображаются как "Активен". 
              По умолчанию используется выбранный провайдер для парсинга счетов.
            </p>
          </div>
        </div>
      </div>

      {!providers || providers.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="text-gray-400 mb-2">
            <Sparkles className="w-12 h-12 mx-auto mb-3" />
          </div>
          <p className="text-gray-600">Провайдеры не найдены</p>
          <p className="text-sm text-gray-500 mt-1">
            Обратитесь к администратору для настройки LLM провайдеров
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {providers.map((provider) => (
            <Card key={provider.id} className="p-6 relative">
              {provider.is_default && (
                <div className="absolute top-4 right-4">
                  <Badge className="bg-blue-600 text-white flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    По умолчанию
                  </Badge>
                </div>
              )}

              <div className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl">{getProviderIcon(provider.provider_type)}</span>
                  <div>
                    <h3 className="font-semibold text-lg">
                      {provider.provider_type_display}
                    </h3>
                    <p className="text-xs text-gray-500">{provider.model_name}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Статус:</span>
                  <Badge className={provider.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                    {provider.is_active ? 'Активен' : 'Неактивен'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Переменная:</span>
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                    {provider.env_key_name}
                  </code>
                </div>
              </div>

              {!provider.is_default && provider.is_active && (
                <Button
                  onClick={() => setDefaultMutation.mutate(provider.id)}
                  disabled={setDefaultMutation.isPending}
                  variant="outline"
                  className="w-full"
                  size="sm"
                >
                  {setDefaultMutation.isPending ? (
                    <>
                      <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                      Установка...
                    </>
                  ) : (
                    'Сделать по умолчанию'
                  )}
                </Button>
              )}

              {provider.is_default && (
                <div className="text-center text-sm text-gray-500 italic">
                  Используется для парсинга
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h3 className="text-sm font-medium mb-2">Как работает парсинг счетов?</h3>
        <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
          <li>При создании расходного платежа загружается PDF-файл</li>
          <li>Система отправляет файл выбранному LLM-провайдеру</li>
          <li>Провайдер извлекает данные: контрагента, суммы, товары</li>
          <li>Форма автоматически предзаполняется распознанными данными</li>
          <li>Пользователь проверяет и при необходимости корректирует данные</li>
        </ul>
      </div>
    </div>
  );
}
