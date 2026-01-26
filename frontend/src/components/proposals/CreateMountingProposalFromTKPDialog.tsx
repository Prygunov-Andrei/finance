import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { X } from 'lucide-react';
import { api } from '../../lib/api';
import { CONSTANTS } from '../../constants';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { toast } from 'sonner';

interface CreateMountingProposalFromTKPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tkpId: number;
  tkpNumber: string;
  tkpName: string;
}

export function CreateMountingProposalFromTKPDialog({
  open,
  onOpenChange,
  tkpId,
  tkpNumber,
  tkpName,
}: CreateMountingProposalFromTKPDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    counterparty: '',
    mounting_estimate: '',
    total_amount: '',
    man_hours: '',
    notes: '',
    conditions_ids: [] as number[],
  });

  // Загрузка контрагентов (только исполнители)
  const { data: counterparties } = useQuery({
    queryKey: ['counterparties-executors'],
    queryFn: async () => {
      const response = await api.getCounterparties({ counterparty_type: 'vendor' });
      // Фильтруем только vendor с subtype=executor
      return response.results.filter((c: any) => c.subtype === 'executor');
    },
    enabled: open,
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Загрузка монтажных смет
  const { data: mountingEstimates } = useQuery({
    queryKey: ['mounting-estimates'],
    queryFn: () => api.getMountingEstimates(),
    enabled: open,
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Загрузка условий для МП
  const { data: conditions } = useQuery({
    queryKey: ['mounting-conditions-active'],
    queryFn: () => api.getMountingConditions({ is_active: true }),
    enabled: open,
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Создание МП
  const createMutation = useMutation({
    mutationFn: () => {
      const data: any = {
        counterparty: parseInt(formData.counterparty),
      };
      
      if (formData.mounting_estimate) {
        data.mounting_estimate = parseInt(formData.mounting_estimate);
      }
      if (formData.total_amount) {
        data.total_amount = formData.total_amount;
      }
      if (formData.man_hours) {
        data.man_hours = formData.man_hours;
      }
      if (formData.notes) {
        data.notes = formData.notes;
      }
      if (formData.conditions_ids.length > 0) {
        data.conditions_ids = formData.conditions_ids;
      }
      
      return api.createMountingProposalFromTKP(tkpId, data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['mounting-proposals'] });
      toast.success('МП создано из ТКП');
      onOpenChange(false);
      navigate(`/proposals/mounting-proposals/${data.id}`);
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Автозаполнение при выборе монтажной сметы
  const handleEstimateChange = (estimateId: string) => {
    setFormData({ ...formData, mounting_estimate: estimateId });
    
    if (estimateId && mountingEstimates?.results) {
      const estimate = mountingEstimates.results.find((e: any) => e.id === parseInt(estimateId));
      if (estimate) {
        setFormData((prev) => ({
          ...prev,
          mounting_estimate: estimateId,
          total_amount: estimate.total_with_vat || '',
          man_hours: estimate.total_man_hours || '',
        }));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  const handleConditionToggle = (conditionId: number) => {
    setFormData((prev) => ({
      ...prev,
      conditions_ids: prev.conditions_ids.includes(conditionId)
        ? prev.conditions_ids.filter((id) => id !== conditionId)
        : [...prev.conditions_ids, conditionId],
    }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-gray-900">Создать МП из ТКП</h2>
            <p className="text-gray-600">
              ТКП № {tkpNumber}: {tkpName}
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="space-y-4">
            {/* Исполнитель */}
            <div>
              <Label htmlFor="counterparty">
                Исполнитель <span className="text-red-500">*</span>
              </Label>
              <select
                id="counterparty"
                value={formData.counterparty}
                onChange={(e) => setFormData({ ...formData, counterparty: e.target.value })}
                required
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Выберите исполнителя</option>
                {counterparties?.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Монтажная смета */}
            <div>
              <Label htmlFor="mounting_estimate">Монтажная смета</Label>
              <select
                id="mounting_estimate"
                value={formData.mounting_estimate}
                onChange={(e) => handleEstimateChange(e.target.value)}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Не выбрано</option>
                {mountingEstimates?.results?.map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.number} - {e.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-gray-500">
                При выборе сметы сумма и человек-часы автоматически заполнятся
              </p>
            </div>

            {/* Сумма и человек-часы */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="total_amount">Сумма (₽)</Label>
                <Input
                  id="total_amount"
                  type="number"
                  step="0.01"
                  value={formData.total_amount}
                  onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="man_hours">Человек-часы</Label>
                <Input
                  id="man_hours"
                  type="number"
                  step="0.01"
                  value={formData.man_hours}
                  onChange={(e) => setFormData({ ...formData, man_hours: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Примечания */}
            <div>
              <Label htmlFor="notes">Примечания</Label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Дополнительные примечания..."
              />
            </div>

            {/* Условия для МП */}
            {conditions && conditions.length > 0 && (
              <div>
                <Label>Условия для МП</Label>
                <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {conditions.map((condition: any) => (
                    <label
                      key={condition.id}
                      className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={formData.conditions_ids.includes(condition.id)}
                        onChange={() => handleConditionToggle(condition.id)}
                        className="mt-1"
                      />
                      <div>
                        <div className="text-gray-900">{condition.name}</div>
                        {condition.description && (
                          <div className="text-gray-500">{condition.description}</div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-2">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!formData.counterparty || createMutation.isPending}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            {createMutation.isPending ? 'Создание...' : 'Создать МП'}
          </Button>
        </div>
      </div>
    </div>
  );
}
