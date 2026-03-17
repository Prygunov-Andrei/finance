import React, { useState } from 'react';
import { Button } from './ui/button';
import { Sparkles, Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import ProviderSelection from './ProviderSelection';
import referencesService from '../services/referencesService';
import { toast } from 'sonner';
import { Resource } from '../services/referencesService';

interface ResourceDiscoveryButtonProps {
  resource: Resource;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showLabel?: boolean;
  onDiscoveryComplete?: () => void;
}

export default function ResourceDiscoveryButton({
  resource,
  variant = 'ghost',
  size = 'sm',
  showLabel = true,
  onDiscoveryComplete,
}: ResourceDiscoveryButtonProps) {
  const [open, setOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartDiscovery = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await referencesService.discoverNewsForResource(resource.id, selectedProvider);
      
      toast.success(`Поиск новостей запущен для источника: ${resource.name}`);
      
      // Закрываем диалог
      setOpen(false);
      
      // Уведомляем родителя об успешном запуске
      if (onDiscoveryComplete) {
        onDiscoveryComplete();
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Не удалось запустить поиск';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Проверяем, можно ли запустить поиск для этого источника
  const canDiscover = resource.source_type !== 'manual';

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={(e) => {
          e.stopPropagation(); // Предотвращаем открытие детального просмотра
          setOpen(true);
        }}
        className="flex items-center gap-2"
        disabled={!canDiscover}
        title={
          canDiscover
            ? 'Запустить поиск новостей для этого источника'
            : 'Автоматический поиск недоступен для источников с ручным вводом'
        }
      >
        <Sparkles className="w-4 h-4" />
        {showLabel && 'Найти новости'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Поиск новостей для источника
            </DialogTitle>
            <DialogDescription>
              Запуск автоматического поиска новостей для источника <strong>{resource.name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <ProviderSelection
              onProviderChange={setSelectedProvider}
              initialProvider={selectedProvider}
            />
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              <X className="w-4 h-4 mr-2" />
              Отмена
            </Button>
            <Button
              onClick={handleStartDiscovery}
              disabled={loading}
              className="flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Запуск...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Запустить поиск
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}