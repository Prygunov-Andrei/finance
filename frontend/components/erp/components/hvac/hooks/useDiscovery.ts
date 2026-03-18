import { useState, useEffect } from 'react';
import { toast } from 'sonner';

export interface DiscoveryInfo {
  last_discovery_date: string | null;
  period_start: string | null;
  period_end: string;
  total_resources?: number;
  total_manufacturers?: number;
}

export interface DiscoveryStatus {
  status: string;
  total: number;
  processed: number;
  created?: number;
  errors?: number;
  total_processed?: number;
  error_message?: string;
}

export interface DiscoveryStartParams {
  configId?: number;
  sections?: string[];
  lastSearchDate?: string;
}

type DialogStage = 'confirm' | 'progress' | 'results';

interface UseDiscoveryProps {
  open: boolean;
  totalItems: number;
  requireConfig?: boolean;
  loadInfoFn: () => Promise<DiscoveryInfo>;
  startDiscoveryFn: (params: DiscoveryStartParams) => Promise<DiscoveryStatus>;
}

export function useDiscovery({ open, totalItems, requireConfig = false, loadInfoFn, startDiscoveryFn }: UseDiscoveryProps) {
  const [stage, setStage] = useState<DialogStage>('confirm');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DiscoveryStatus | null>(null);
  const [discoveryInfo, setDiscoveryInfo] = useState<DiscoveryInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [selectedLastSearchDate, setSelectedLastSearchDate] = useState<string>('');

  // Сброс состояния при открытии диалога
  useEffect(() => {
    if (open) {
      setStage('confirm');
      setLoading(false);
      setError(null);
      setResults(null);
      setSelectedConfigId(null);
      setSelectedSections([]);
      setSelectedLastSearchDate('');
      loadDiscoveryInfo();
    }
  }, [open]);

  // Дефолт: подставляем start date из discoveryInfo (если он есть),
  // но только если пользователь ещё не менял дату руками.
  useEffect(() => {
    if (!open) return;
    if (!discoveryInfo?.period_start) return;
    if (selectedLastSearchDate) return;

    const dateStr = new Date(discoveryInfo.period_start).toISOString().split('T')[0];
    setSelectedLastSearchDate(dateStr);
  }, [open, discoveryInfo, selectedLastSearchDate]);

  const loadDiscoveryInfo = async () => {
    setLoadingInfo(true);
    try {
      const info = await loadInfoFn();
      setDiscoveryInfo(info);
    } catch (err: any) {
      // Устанавливаем дефолтные значения при ошибке
      setDiscoveryInfo({
        last_discovery_date: null,
        period_start: null,
        period_end: new Date().toISOString().split('T')[0],
        total_resources: totalItems,
        total_manufacturers: totalItems,
      });
    } finally {
      setLoadingInfo(false);
    }
  };

  const handleStartDiscovery = async () => {
    setLoading(true);
    setError(null);

    try {
      if (requireConfig && !selectedConfigId) {
        const errorMsg = 'Выберите конфигурацию поиска';
        setError(errorMsg);
        toast.error(`Ошибка: ${errorMsg}`);
        return;
      }

      await startDiscoveryFn({
        configId: selectedConfigId ?? undefined,
        sections: selectedSections.length > 0 ? selectedSections : undefined,
        lastSearchDate: selectedLastSearchDate || undefined,
      });
      
      // Переходим к отображению прогресса
      setStage('progress');
      toast.success('Поиск новостей запущен!');
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Не удалось запустить поиск новостей';
      setError(errorMsg);
      toast.error(`Ошибка: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = (status: DiscoveryStatus) => {
    setResults(status);
    setStage('results');
    toast.success(`Поиск завершен! Создано новостей: ${status.created || 0}`);
  };

  const handleError = (errorMsg: string) => {
    setError(errorMsg);
    toast.error(errorMsg);
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Никогда';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return {
    stage,
    loading,
    error,
    results,
    discoveryInfo,
    loadingInfo,
    selectedConfigId,
    setSelectedConfigId,
    selectedSections,
    setSelectedSections,
    selectedLastSearchDate,
    setSelectedLastSearchDate,
    handleStartDiscovery,
    handleComplete,
    handleError,
    formatDate,
    formatDateShort,
  };
}
