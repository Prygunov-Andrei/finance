'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, FileDown, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { publicEstimatesApi } from '@/lib/api/public-client';
import { EstimateApiProvider } from '@/lib/api/estimate-api-context';
import { EstimateItemsEditor } from '@/components/erp/components/estimates/items-editor';

export default function CabinetPage() {
  const [estimateId, setEstimateId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    // Загрузить активную смету
    publicEstimatesApi.getEstimates().then((data) => {
      const estimates = Array.isArray(data) ? data : (data as any)?.results || [];
      if (estimates.length > 0) {
        setEstimateId(estimates[0].id);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await publicEstimatesApi.createEstimate({
        name: 'Моя смета',
        object: 1, // TODO: выбор объекта или создание дефолтного
        legal_entity: 1,
      } as any);
      setEstimateId(result.id);
      toast.success('Смета создана');
    } catch (err) {
      toast.error(`Ошибка: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
    } finally {
      setCreating(false);
    }
  };

  const handleExport = async () => {
    if (!estimateId) return;
    try {
      const blob = await publicEstimatesApi.exportEstimate(estimateId, 'external');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smeta-${estimateId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Смета скачана');
    } catch (err) {
      toast.error(`Ошибка экспорта: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!estimateId) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Начните работу со сметой
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Создайте новую смету или загрузите спецификацию из Excel/PDF
        </p>
        <Button onClick={handleCreate} disabled={creating} size="lg">
          {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Создать смету
        </Button>
      </div>
    );
  }

  return (
    <EstimateApiProvider value={publicEstimatesApi}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Моя смета
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
              <FileDown className="h-4 w-4 mr-1" />
              Скачать Excel
            </Button>
          </div>
        </div>

        <EstimateItemsEditor estimateId={estimateId} />
      </div>
    </EstimateApiProvider>
  );
}
