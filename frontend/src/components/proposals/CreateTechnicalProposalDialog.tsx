import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, TechnicalProposalDetail, EstimateList, FrontOfWorkItem } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { toast } from 'sonner';
import { useObjects, useLegalEntities } from '../../hooks';
import { CONSTANTS } from '../../constants';

interface FrontOfWorkRow {
  front_item_id: number;
  name: string;
  category: string;
  when_text: string;
  when_date: string;
  selected: boolean;
}

interface CreateTechnicalProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tkp?: TechnicalProposalDetail;
}

export function CreateTechnicalProposalDialog({ open, onOpenChange, tkp }: CreateTechnicalProposalDialogProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    object: '',
    object_area: '',
    legal_entity: '',
    outgoing_number: '',
    advance_required: '',
    work_duration: '',
    validity_days: '30',
    notes: '',
    status: 'draft',
    checked_by: '',
    approved_by: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [selectedEstimateIds, setSelectedEstimateIds] = useState<number[]>([]);
  const [frontOfWorkRows, setFrontOfWorkRows] = useState<FrontOfWorkRow[]>([]);

  const { data: objects } = useObjects();
  const { data: legalEntities } = useLegalEntities();

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.getUsers(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const selectedObjectId = formData.object ? Number(formData.object) : undefined;

  const { data: objectEstimates } = useQuery({
    queryKey: ['estimates', 'by-object', selectedObjectId],
    enabled: Boolean(selectedObjectId),
    queryFn: () => api.getEstimates({ object: selectedObjectId }),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: frontOfWorkItems } = useQuery({
    queryKey: ['front-of-work-items', 'active'],
    queryFn: () => api.getFrontOfWorkItems({ is_active: true }),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  useEffect(() => {
    if (frontOfWorkItems && frontOfWorkRows.length === 0 && !tkp) {
      const rows: FrontOfWorkRow[] = frontOfWorkItems.map((item: FrontOfWorkItem) => ({
        front_item_id: item.id,
        name: item.name,
        category: item.category,
        when_text: '',
        when_date: '',
        selected: item.is_default,
      }));
      setFrontOfWorkRows(rows);
    }
  }, [frontOfWorkItems, frontOfWorkRows.length, tkp]);

  useEffect(() => {
    if (tkp) {
      setFormData({
        name: tkp.name,
        date: tkp.date,
        object: tkp.object.toString(),
        object_area: tkp.object_area?.toString() || '',
        legal_entity: tkp.legal_entity.toString(),
        outgoing_number: tkp.outgoing_number || '',
        advance_required: tkp.advance_required || '',
        work_duration: tkp.work_duration || '',
        validity_days: tkp.validity_days.toString(),
        notes: tkp.notes || '',
        status: tkp.status,
        checked_by: tkp.checked_by?.toString() || '',
        approved_by: tkp.approved_by?.toString() || '',
      });
      if (tkp.estimates) {
        setSelectedEstimateIds(
          Array.isArray(tkp.estimates) ? tkp.estimates.map((e: number | { id: number }) => typeof e === 'number' ? e : e.id) : []
        );
      }
    }
  }, [tkp]);

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (tkp) {
        return api.updateTechnicalProposal(tkp.id, data);
      } else {
        return api.createTechnicalProposal(data);
      }
    },
    onSuccess: async (result) => {
      if (selectedEstimateIds.length > 0 && result?.id) {
        try {
          await api.addEstimatesToTKP(result.id, selectedEstimateIds);
        } catch {
          toast.error('ТКП создано, но не удалось привязать сметы');
        }
      }

      if (result?.id) {
        const selectedRows = frontOfWorkRows.filter((r) => r.selected);
        for (const row of selectedRows) {
          try {
            await api.createTKPFrontOfWork({
              tkp: result.id,
              front_item: row.front_item_id,
              when_text: row.when_text,
              when_date: row.when_date || null,
            });
          } catch {
            // silently skip duplicates
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['technical-proposals'] });
      if (tkp) {
        queryClient.invalidateQueries({ queryKey: ['technical-proposal', tkp.id.toString()] });
      }
      toast.success(tkp ? 'ТКП обновлено' : 'ТКП создано');
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
      object_area: '',
      legal_entity: '',
      outgoing_number: '',
      advance_required: '',
      work_duration: '',
      validity_days: '30',
      notes: '',
      status: 'draft',
      checked_by: '',
      approved_by: '',
    });
    setFile(null);
    setSelectedEstimateIds([]);
    setFrontOfWorkRows([]);
  };

  const handleEstimateToggle = (estimateId: number) => {
    setSelectedEstimateIds((prev) =>
      prev.includes(estimateId)
        ? prev.filter((id) => id !== estimateId)
        : [...prev, estimateId]
    );
  };

  const handleFrontOfWorkToggle = (index: number) => {
    setFrontOfWorkRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, selected: !row.selected } : row))
    );
  };

  const handleFrontOfWorkChange = (index: number, field: 'when_text' | 'when_date', value: string) => {
    setFrontOfWorkRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
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
    if (!formData.legal_entity) {
      toast.error('Компания обязательна');
      return;
    }

    const validityDays = parseInt(formData.validity_days);
    if (validityDays < 1 || validityDays > 365) {
      toast.error('Срок действия должен быть от 1 до 365 дней');
      return;
    }

    const formDataToSend = new FormData();
    formDataToSend.append('name', formData.name);
    formDataToSend.append('date', formData.date);
    formDataToSend.append('object', formData.object);
    if (formData.object_area) formDataToSend.append('object_area', formData.object_area);
    formDataToSend.append('legal_entity', formData.legal_entity);
    if (formData.outgoing_number) formDataToSend.append('outgoing_number', formData.outgoing_number);
    if (formData.advance_required) formDataToSend.append('advance_required', formData.advance_required);
    if (formData.work_duration) formDataToSend.append('work_duration', formData.work_duration);
    formDataToSend.append('validity_days', formData.validity_days);
    if (formData.notes) formDataToSend.append('notes', formData.notes);
    formDataToSend.append('status', formData.status);
    if (formData.checked_by) formDataToSend.append('checked_by', formData.checked_by);
    if (formData.approved_by) formDataToSend.append('approved_by', formData.approved_by);

    if (file) {
      formDataToSend.append('file', file);
    }

    saveMutation.mutate(formDataToSend);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tkp ? 'Редактировать ТКП' : 'Создать ТКП'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs defaultValue="main" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="main">Основные поля</TabsTrigger>
              <TabsTrigger value="estimates">
                Сметы {selectedEstimateIds.length > 0 && `(${selectedEstimateIds.length})`}
              </TabsTrigger>
              <TabsTrigger value="front-of-work">
                Фронт работ {frontOfWorkRows.filter((r) => r.selected).length > 0 && `(${frontOfWorkRows.filter((r) => r.selected).length})`}
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
                    placeholder="Название ТКП"
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
                  <Label htmlFor="outgoing_number">Исходящий номер</Label>
                  <Input
                    id="outgoing_number"
                    value={formData.outgoing_number}
                    onChange={(e) => setFormData({ ...formData, outgoing_number: e.target.value })}
                    placeholder="Опционально"
                  />
                </div>

                <div>
                  <Label htmlFor="object">Объект *</Label>
                  <select
                    id="object"
                    className="w-full px-3 py-2 border rounded-md"
                    value={formData.object}
                    onChange={(e) => {
                      setFormData({ ...formData, object: e.target.value });
                      setSelectedEstimateIds([]);
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
                  <Label htmlFor="object_area">Площадь объекта, м²</Label>
                  <Input
                    id="object_area"
                    type="number"
                    step="0.01"
                    value={formData.object_area}
                    onChange={(e) => setFormData({ ...formData, object_area: e.target.value })}
                    placeholder="Опционально"
                  />
                </div>

                <div>
                  <Label htmlFor="legal_entity">Наша компания *</Label>
                  <select
                    id="legal_entity"
                    className="w-full px-3 py-2 border rounded-md"
                    value={formData.legal_entity}
                    onChange={(e) => setFormData({ ...formData, legal_entity: e.target.value })}
                    required
                  >
                    <option value="">Выберите компанию</option>
                    {legalEntities?.results?.map((entity) => (
                      <option key={entity.id} value={entity.id}>{entity.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="validity_days">Срок действия (дни) *</Label>
                  <Input
                    id="validity_days"
                    type="number"
                    min="1"
                    max="365"
                    value={formData.validity_days}
                    onChange={(e) => setFormData({ ...formData, validity_days: e.target.value })}
                    required
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="advance_required">Необходимый аванс</Label>
                  <Textarea
                    id="advance_required"
                    value={formData.advance_required}
                    onChange={(e) => setFormData({ ...formData, advance_required: e.target.value })}
                    placeholder="Информация об авансе"
                    rows={2}
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="work_duration">Срок проведения работ</Label>
                  <Textarea
                    id="work_duration"
                    value={formData.work_duration}
                    onChange={(e) => setFormData({ ...formData, work_duration: e.target.value })}
                    placeholder="Информация о сроках"
                    rows={2}
                  />
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

                <div>
                  <Label htmlFor="status">Статус *</Label>
                  <select
                    id="status"
                    className="w-full px-3 py-2 border rounded-md"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    required
                  >
                    <option value="draft">Черновик</option>
                    <option value="in_progress">В работе</option>
                    <option value="checking">На проверке</option>
                    <option value="approved">Утверждено</option>
                    <option value="sent">Отправлено</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="file">Файл ТКП (PDF)</Label>
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

                <div>
                  <Label htmlFor="checked_by">Кто проверил</Label>
                  <select
                    id="checked_by"
                    className="w-full px-3 py-2 border rounded-md"
                    value={formData.checked_by}
                    onChange={(e) => setFormData({ ...formData, checked_by: e.target.value })}
                  >
                    <option value="">Не выбрано</option>
                    {users?.results?.map((user) => (
                      <option key={user.id} value={user.id}>{user.username}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="approved_by">Кто утвердил</Label>
                  <select
                    id="approved_by"
                    className="w-full px-3 py-2 border rounded-md"
                    value={formData.approved_by}
                    onChange={(e) => setFormData({ ...formData, approved_by: e.target.value })}
                  >
                    <option value="">Не выбрано</option>
                    {users?.results?.map((user) => (
                      <option key={user.id} value={user.id}>{user.username}</option>
                    ))}
                  </select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="estimates" className="mt-4">
              {!formData.object ? (
                <div className="text-center text-muted-foreground py-8">
                  Сначала выберите объект на вкладке «Основные поля»
                </div>
              ) : !objectEstimates || objectEstimates.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Нет смет для выбранного объекта
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground mb-3">
                    Выберите сметы, на которых основано ТКП
                  </p>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm" role="grid" aria-label="Выбор смет">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="w-10 p-3 text-left"></th>
                          <th className="p-3 text-left">Номер</th>
                          <th className="p-3 text-left">Название</th>
                          <th className="p-3 text-left">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {objectEstimates.map((est: EstimateList) => (
                          <tr
                            key={est.id}
                            className="border-t hover:bg-muted/30 cursor-pointer"
                            tabIndex={0}
                            role="row"
                            aria-selected={selectedEstimateIds.includes(est.id)}
                            onClick={() => handleEstimateToggle(est.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleEstimateToggle(est.id);
                              }
                            }}
                          >
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={selectedEstimateIds.includes(est.id)}
                                onChange={() => handleEstimateToggle(est.id)}
                                aria-label={`Выбрать смету ${est.number}`}
                              />
                            </td>
                            <td className="p-3 font-mono">{est.number}</td>
                            <td className="p-3">{est.name}</td>
                            <td className="p-3">{est.status_display}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="front-of-work" className="mt-4">
              {frontOfWorkRows.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  Загрузка справочника фронта работ...
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground mb-3">
                    Пункты, отмеченные «по умолчанию», выбраны автоматически. Вы можете добавить или удалить строки.
                  </p>
                  <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm" role="grid" aria-label="Фронт работ">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="w-10 p-3 text-left"></th>
                          <th className="p-3 text-left">Наименование</th>
                          <th className="p-3 text-left w-24">Категория</th>
                          <th className="p-3 text-left w-40">Когда (текст)</th>
                          <th className="p-3 text-left w-36">Когда (дата)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {frontOfWorkRows.map((row, index) => (
                          <tr key={row.front_item_id} className="border-t hover:bg-muted/30">
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={row.selected}
                                onChange={() => handleFrontOfWorkToggle(index)}
                                aria-label={`Выбрать: ${row.name}`}
                              />
                            </td>
                            <td className="p-3">{row.name}</td>
                            <td className="p-3 text-muted-foreground">{row.category}</td>
                            <td className="p-3">
                              <Input
                                value={row.when_text}
                                onChange={(e) => handleFrontOfWorkChange(index, 'when_text', e.target.value)}
                                placeholder="Срок"
                                className="h-8"
                                disabled={!row.selected}
                              />
                            </td>
                            <td className="p-3">
                              <Input
                                type="date"
                                value={row.when_date}
                                onChange={(e) => handleFrontOfWorkChange(index, 'when_date', e.target.value)}
                                className="h-8"
                                disabled={!row.selected}
                              />
                            </td>
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {tkp ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
