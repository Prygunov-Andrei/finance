import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { CheckCircle2, Zap, Brain, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import referencesService from '../services/referencesService';

export interface Provider {
  id: string;
  name: string;
  description: string;
  available: boolean;
}

interface ProviderSelectionProps {
  selectedProvider: string;
  onProviderChange: (providerId: string) => void;
}

export default function ProviderSelection({ selectedProvider, onProviderChange }: ProviderSelectionProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [defaultProvider, setDefaultProvider] = useState<string>('');

  useEffect(() => {
    const fetchProviders = async () => {
      setLoading(true);
      try {
        const data = await referencesService.getAvailableProviders();
        setProviders(data.providers);
        setDefaultProvider(data.default_provider);
        
        // Устанавливаем выбранного провайдера если это auto
        if (selectedProvider === 'auto') {
          onProviderChange(data.default_provider);
        }
      } catch (err: any) {
        // При ошибке используем fallback провайдеры
        // Это позволяет продолжить работу даже если API недоступен
        setProviders([
          { id: 'openai', name: 'OpenAI GPT', is_available: false },
          { id: 'anthropic', name: 'Anthropic Claude', is_available: false },
          { id: 'google', name: 'Google Gemini', is_available: false },
        ]);
        setDefaultProvider('openai');
      } finally {
        setLoading(false);
      }
    };

    fetchProviders();
  }, [selectedProvider, onProviderChange]);

  const getProviderIcon = (providerId: string) => {
    switch (providerId) {
      case 'auto':
        return <Sparkles className="w-5 h-5" />;
      case 'grok':
        return <Zap className="w-5 h-5" />;
      case 'anthropic':
        return <Brain className="w-5 h-5" />;
      case 'openai':
        return <Sparkles className="w-5 h-5" />;
      default:
        return <Sparkles className="w-5 h-5" />;
    }
  };

  const getProviderColor = (providerId: string) => {
    switch (providerId) {
      case 'auto':
        return 'text-purple-600 dark:text-purple-400';
      case 'grok':
        return 'text-green-600 dark:text-green-400';
      case 'anthropic':
        return 'text-blue-600 dark:text-blue-400';
      case 'openai':
        return 'text-amber-600 dark:text-amber-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getProviderBorderColor = (providerId: string) => {
    switch (providerId) {
      case 'auto':
        return 'border-purple-500';
      case 'grok':
        return 'border-green-500';
      case 'anthropic':
        return 'border-blue-500';
      case 'openai':
        return 'border-amber-500';
      default:
        return 'border-gray-500';
    }
  };

  const getProviderBgColor = (providerId: string) => {
    switch (providerId) {
      case 'auto':
        return 'bg-purple-50/50 dark:bg-purple-950/20';
      case 'grok':
        return 'bg-green-50/50 dark:bg-green-950/20';
      case 'anthropic':
        return 'bg-blue-50/50 dark:bg-blue-950/20';
      case 'openai':
        return 'bg-amber-50/50 dark:bg-amber-950/20';
      default:
        return 'bg-gray-50/50 dark:bg-gray-950/20';
    }
  };

  const getProviderButtonColor = (providerId: string) => {
    switch (providerId) {
      case 'auto':
        return 'bg-purple-500';
      case 'grok':
        return 'bg-green-500';
      case 'anthropic':
        return 'bg-blue-500';
      case 'openai':
        return 'bg-amber-500';
      default:
        return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Загрузка провайдеров...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium mb-1">Провайдер LLM</h3>
        <p className="text-sm text-muted-foreground">
          Выберите провайдер для поиска и обработки новостей
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {providers.map((provider) => {
          const isSelected = selectedProvider === provider.id;
          const isAvailable = provider.available;

          return (
            <Card
              key={provider.id}
              className={`p-4 cursor-pointer transition-all border-2 ${
                !isAvailable
                  ? 'opacity-50 cursor-not-allowed'
                  : isSelected
                  ? `${getProviderBorderColor(provider.id)} ${getProviderBgColor(provider.id)}`
                  : 'border-transparent hover:border-muted-foreground/20'
              }`}
              onClick={() => isAvailable && onProviderChange(provider.id)}
            >
              <div className="flex items-start gap-3">
                {/* Иконка-индикатор */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isSelected && isAvailable
                      ? getProviderButtonColor(provider.id)
                      : 'bg-muted'
                  }`}
                >
                  {isSelected && isAvailable ? (
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  ) : (
                    <div className={`${isAvailable ? getProviderColor(provider.id) : 'text-muted-foreground'}`}>
                      {getProviderIcon(provider.id)}
                    </div>
                  )}
                </div>

                {/* Контент */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${!isAvailable ? 'text-muted-foreground' : ''}`}>
                      {provider.name}
                    </span>
                    {!isAvailable && (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
                        Недоступен
                      </span>
                    )}
                    {provider.id === 'grok' && isAvailable && (
                      <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full">
                        Рекомендуется
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {provider.description}
                  </p>
                  {!isAvailable && (
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      API ключ не настроен
                    </p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Дополнительная информация */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>Автоматический выбор</strong> использует цепочку провайдеров для максимальной надежности. 
          Если один провайдер недоступен, система автоматически переключится на следующий.
        </AlertDescription>
      </Alert>
    </div>
  );
}