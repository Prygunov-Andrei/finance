import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, MountingProposalDetail, MountingEstimateList, MountingCondition } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { toast } from 'sonner';
import { useObjects, useCounterparties } from '../../hooks';
import { CONSTANTS } from '../../constants';

interface CreateMountingProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mp?: MountingProposalDetail;
}

export function CreateMountingProposalDialog({
  open,
  onOpenChange,
  mp,
}: CreateMountingProposalDialogProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    object: '',
    counterparty: '',
    parent_tkp: '',
    notes: '',
    status: 'draft',
  });
  const [file, setFile] = useState<File | null>(null);
  const [selectedMountingEstimateIds, setSelectedMountingEstimateIds] = useState<number[]>([]);
  const [selectedConditionIds, setSelectedConditionIds] = useState<number[]>([]);
  const [conditionsLoaded, setConditionsLoaded] = useState(false);

  const { data: objects } = useObjects();
  const { data: counterparties } = useCounterparties();

  const { data: tkpList } = useQuery({
    queryKey: ['technical-proposals'],
    queryFn: () => api.getTechnicalProposals(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const selectedObjectId = formData.object ? Number(formData.object) : undefined;

  const { data: mountingEstimates } = useQuery({
    queryKey: ['mounting-estimates', 'by-object', selectedObjectId],
    enabled: Boolean(selectedObjectId),
    queryFn: () => api.getMountingEstimates({ object: selectedObjectId }),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: allConditions } = useQuery({
    queryKey: ['mounting-conditions', 'active'],
    queryFn: () => api.getMountingConditions({ is_active: true }),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  useEffect(() => {
    if (allConditions && !conditionsLoaded && !mp) {
      const defaultIds = allConditions
        .filter((c: MountingCondition) => c.is_default)
        .map((c: MountingCondition) => c.id);
      setSelectedConditionIds(defaultIds);
      setConditionsLoaded(true);
    }
  }, [allConditions, conditionsLoaded, mp]);

  useEffect(() => {
    if (mp) {
      setFormData({
        name: mp.name,
        date: mp.date,
        object: mp.object.toString(),
        counterparty: mp.counterparty?.toString() || '',
        parent_tkp: mp.parent_tkp?.toString() || '',
        notes: mp.notes || '',
        status: mp.status,
      });
      setSelectedMountingEstimateIds(mp.mounting_estimates || []);
      setSelectedConditionIds(mp.conditions_ids || mp.conditions?.map((c) => c.id) || []);
      setConditionsLoaded(true);
    }
  }, [mp]);

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
      notes: '',
      status: 'draft',
    });
    setFile(null);
    setSelectedMountingEstimateIds([]);
    setSelectedConditionIds([]);
    setConditionsLoaded(false);
  };

  const handleMountingEstimateToggle = (id: number) => {
    setSelectedMountingEstimateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleConditionToggle = (id: number) => {
    setSelectedConditionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
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

    const formDataToSend = new FormData();
    formDataToSend.append('name', formData.name);
    formDataToSend.append('date', formData.date);
    formDataToSend.append('object', formData.object);
    if (formData.counterparty) formDataToSend.append('counterparty', formData.counterparty);
    if (formData.parent_tkp) formDataToSend.append('parent_tkp', formData.parent_tkp);
    if (formData.notes) formDataToSend.append('notes', formData.notes);
    formDataToSend.append('status', formData.status);

    selectedMountingEstimateIds.forEach((id) => {
      formDataToSend.append('mounting_estimates_ids', id.toString());
    });

    selectedConditionIds.forEach((id) => {
      formDataToSend.append('conditions_ids', id.toString());
    });

    if (file) {
      formDataToSend.append('file', file);
    }

    saveMutation.mutate(formDataToSend);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mp ? 'Редактировать МП' : 'Создать МП'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs defaultValue="main" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="main">Основные поля</TabsTrigger>
              <TabsTrigger value="mounting-estimates">
                Монтажные сметы {selectedMountingEstimateIds.length > 0 && `(${selectedMountingEstimateIds.length})`}
              </TabsTrigger>
              <TabsTrigger value="conditions">
                Условия для МП {selectedConditionIds.length > 0 && `(${selectedConditionIds.length})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="main" className="space-y-4 mt-4">
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
                    onChange={(e) => {
                      setFormData({ ...formData, object: e.target.value });
                      setSelectedMountingEstimateIds([]);
                    }}
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

                <div className="col-span-2">
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
              </div>
            </TabsContent>

            <TabsContent value="mounting-estimates" className="mt-4">
              {!formData.object ? (
                <div className="text-center text-muted-foreground py-8">
                  Сначала выберите объект на вкладке «Основные поля»
                </div>
              ) : !mountingEstimates || mountingEstimates.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Нет монтажных смет для выбранного объекта
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground mb-3">
                    Выберите монтажные сметы для МП
                  </p>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm" role="grid" aria-label="Выбор монтажных смет">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="w-10 p-3 text-left"></th>
                          <th className="p-3 text-left">Номер</th>
                          <th className="p-3 text-left">Название</th>
                          <th className="p-3 text-left">Сумма</th>
                          <th className="p-3 text-left">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mountingEstimates.map((est: MountingEstimateList) => (
                          <tr
                            key={est.id}
                            className="border-t hover:bg-muted/30 cursor-pointer"
                            tabIndex={0}
                            role="row"
                            aria-selected={selectedMountingEstimateIds.includes(est.id)}
                            onClick={() => handleMountingEstimateToggle(est.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleMountingEstimateToggle(est.id);
                              }
                            }}
                          >
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={selectedMountingEstimateIds.includes(est.id)}
                                onChange={() => handleMountingEstimateToggle(est.id)}
                                aria-label={`Выбрать монтажную смету ${est.number}`}
                              />
                            </td>
                            <td className="p-3 font-mono">{est.number}</td>
                            <td className="p-3">{est.name}</td>
                            <td className="p-3">{Number(est.total_amount).toLocaleString('ru-RU')} ₽</td>
                            <td className="p-3">{est.status_display}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="conditions" className="mt-4">
              {!allConditions || allConditions.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Нет доступных условий для МП
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground mb-3">
                    Условия, отмеченные «по умолчанию», выбраны автоматически. Вы можете добавить или удалить.
                  </p>
                  <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm" role="grid" aria-label="Условия для МП">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="w-10 p-3 text-left"></th>
                          <th className="p-3 text-left">Название</th>
                          <th className="p-3 text-left">Описание</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allConditions.map((condition: MountingCondition) => (
                          <tr
                            key={condition.id}
                            className="border-t hover:bg-muted/30 cursor-pointer"
                            tabIndex={0}
                            role="row"
                            aria-selected={selectedConditionIds.includes(condition.id)}
                            onClick={() => handleConditionToggle(condition.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleConditionToggle(condition.id);
                              }
                            }}
                          >
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={selectedConditionIds.includes(condition.id)}
                                onChange={() => handleConditionToggle(condition.id)}
                                aria-label={`Выбрать условие: ${condition.name}`}
                              />
                            </td>
                            <td className="p-3 font-medium">{condition.name}</td>
                            <td className="p-3 text-muted-foreground">{condition.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

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
