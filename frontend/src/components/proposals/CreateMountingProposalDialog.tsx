import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, MountingProposalDetail } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { useObjects, useCounterparties, useMountingConditions } from '../../hooks';
import { CONSTANTS } from '../../constants';

interface CreateMountingProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mp?: MountingProposalDetail;
}

export function CreateMountingProposalDialog({ 
  open, 
  onOpenChange, 
  mp 
}: CreateMountingProposalDialogProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    object: '',
    counterparty: '',
    parent_tkp: '',
    mounting_estimate: '',
    notes: '',
    status: 'draft',
    conditions: [] as number[],
  });
  const [file, setFile] = useState<File | null>(null);

  // Загрузка справочников с кешированием
  const { data: objects } = useObjects();
  const { data: counterparties } = useCounterparties();
  const { data: conditions } = useMountingConditions();

  // Загрузка ТКП
  const { data: tkpList } = useQuery({
    queryKey: ['technical-proposals'],
    queryFn: () => api.getTechnicalProposals(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Загрузка монтажных смет
  const { data: mountingEstimates } = useQuery({
    queryKey: ['mounting-estimates'],
    queryFn: () => api.getMountingEstimates(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Заполнение формы при редактировании
  useEffect(() => {
    if (mp) {
      setFormData({
        name: mp.name,
        date: mp.date,
        object: mp.object.toString(),
        counterparty: mp.counterparty?.toString() || '',
        parent_tkp: mp.parent_tkp?.toString() || '',
        mounting_estimate: mp.mounting_estimate?.toString() || '',
        notes: mp.notes || '',
        status: mp.status,
        conditions: mp.conditions_ids || [],
      });
    }
  }, [mp]);

  // Создание/обновление МП
  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (mp) {
        return api.updateMountingProposal(mp.id, data);
      } else {
        return api.createMountingProposalStandalone(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mounting-proposals'] });
      if (mp) {
        queryClient.invalidateQueries({ queryKey: ['mounting-proposal', mp.id.toString()] });
      }
      toast.success(mp ? 'МП обновлено' : 'МП создано');
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      date: new Date().toISOString().split('T')[0],
      object: '',
      counterparty: '',
      parent_tkp: '',
      mounting_estimate: '',
      notes: '',
      status: 'draft',
      conditions: [],
    });
    setFile(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Название обязательно');
      return;
    }

    if (!formData.date) {
      toast.error('Дата обязательна');
      return;
    }

    if (!formData.object) {
      toast.error('Объект обязателен');
      return;
    }

    // Создаем FormData для отправки файла
    const formDataToSend = new FormData();
    formDataToSend.append('name', formData.name);
    formDataToSend.append('date', formData.date);
    formDataToSend.append('object', formData.object);
    if (formData.counterparty) formDataToSend.append('counterparty', formData.counterparty);
    if (formData.parent_tkp) formDataToSend.append('parent_tkp', formData.parent_tkp);
    if (formData.mounting_estimate) formDataToSend.append('mounting_estimate', formData.mounting_estimate);
    if (formData.notes) formDataToSend.append('notes', formData.notes);
    formDataToSend.append('status', formData.status);
    
    // Добавляем условия
    formData.conditions.forEach(conditionId => {
      formDataToSend.append('conditions', conditionId.toString());
    });
    
    if (file) {
      formDataToSend.append('file', file);
    }

    saveMutation.mutate(formDataToSend);
  };

  const handleConditionToggle = (conditionId: number) => {
    setFormData(prev => ({
      ...prev,
      conditions: prev.conditions.includes(conditionId)
        ? prev.conditions.filter(id => id !== conditionId)
        : [...prev.conditions, conditionId]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mp ? 'Редактировать МП' : 'Создать МП'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="name">Название *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Название МП"
                required
              />
            </div>

            <div>
              <Label htmlFor="date">Дата *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="status">Статус *</Label>
              <select
                id="status"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                required
              >
                <option value="draft">Черновик</option>
                <option value="published">Опубликовано</option>
                <option value="sent">Отправлено</option>
                <option value="approved">Утверждено</option>
                <option value="rejected">Отклонено</option>
              </select>
            </div>

            <div>
              <Label htmlFor="object">Объект *</Label>
              <select
                id="object"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.object}
                onChange={(e) => setFormData({ ...formData, object: e.target.value })}
                required
              >
                <option value="">Выберите объект</option>
                {objects?.results?.map((obj) => (
                  <option key={obj.id} value={obj.id}>{obj.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="counterparty">Контрагент</Label>
              <select
                id="counterparty"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.counterparty}
                onChange={(e) => setFormData({ ...formData, counterparty: e.target.value })}
              >
                <option value="">Не выбран</option>
                {counterparties?.results?.map((cp) => (
                  <option key={cp.id} value={cp.id}>{cp.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="parent_tkp">Связанное ТКП</Label>
              <select
                id="parent_tkp"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.parent_tkp}
                onChange={(e) => setFormData({ ...formData, parent_tkp: e.target.value })}
              >
                <option value="">Не выбрано</option>
                {tkpList?.results?.map((tkp) => (
                  <option key={tkp.id} value={tkp.id}>{tkp.number} - {tkp.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="mounting_estimate">Монтажная смета</Label>
              <select
                id="mounting_estimate"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.mounting_estimate}
                onChange={(e) => setFormData({ ...formData, mounting_estimate: e.target.value })}
              >
                <option value="">Не выбрана</option>
                {mountingEstimates?.map((est) => (
                  <option key={est.id} value={est.id}>{est.name}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <Label htmlFor="notes">Примечания</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Дополнительные примечания"
                rows={3}
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="file">Файл МП (PDF)</Label>
              <Input
                id="file"
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0];
                  if (selectedFile && selectedFile.type === 'application/pdf') {
                    setFile(selectedFile);
                  } else if (selectedFile) {
                    toast.error('Можно загружать только PDF файлы');
                    e.target.value = '';
                  }
                }}
              />
            </div>

            {/* Условия */}
            {conditions && conditions.results && conditions.results.length > 0 && (
              <div className="col-span-2">
                <Label>Условия для МП</Label>
                <div className="mt-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3 space-y-2">
                  {conditions.results.map((condition) => (
                    <label
                      key={condition.id}
                      className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={formData.conditions.includes(condition.id)}
                        onChange={() => handleConditionToggle(condition.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
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

          <DialogFooter>
            <Button 
              type="button" 
              onClick={() => onOpenChange(false)}
              className="bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Отмена
            </Button>
            <Button 
              type="submit" 
              disabled={saveMutation.isPending}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {mp ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}