import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ContractDetail, WorkScheduleItem, CreateWorkScheduleItemData } from '../lib/api';
import { Loader2, Plus, Calendar, Users, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { toast } from 'sonner';
import { formatDate, formatAmount, formatCurrency } from '../lib/utils';
import { CONSTANTS } from '../constants';

interface WorkScheduleTabProps {
  contractId: number;
}

export function WorkScheduleTab({ contractId }: WorkScheduleTabProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkScheduleItem | null>(null);
  const queryClient = useQueryClient();

  // Получаем данные договора для валидации дат
  const { data: contract } = useQuery<ContractDetail>({
    queryKey: ['contract', contractId],
    queryFn: () => api.getContractDetail(contractId),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: scheduleItems, isLoading } = useQuery({
    queryKey: ['work-schedule', contractId],
    queryFn: () => api.getContractSchedule(contractId),
    enabled: !!contractId,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const createMutation = useMutation({
    mutationFn: api.createWorkScheduleItem.bind(api),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-schedule', contractId] });
      setIsDialogOpen(false);
      setEditingItem(null);
      toast.success('Задача графика добавлена');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateWorkScheduleItemData> }) =>
      api.updateWorkScheduleItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-schedule', contractId] });
      setIsDialogOpen(false);
      setEditingItem(null);
      toast.success('Задача обновлена');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteWorkScheduleItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-schedule', contractId] });
      toast.success('Задача удалена');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleEdit = (item: WorkScheduleItem) => {
    setEditingItem(item);
    setIsDialogOpen(true);
  };

  const handleDelete = (item: WorkScheduleItem) => {
    if (confirm(`Удалить задачу "${item.name}"?`)) {
      deleteMutation.mutate(item.id);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Не начато';
      case 'in_progress': return 'В работе';
      case 'done': return 'Выполнено';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-700';
      case 'in_progress': return 'bg-blue-100 text-blue-700';
      case 'done': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  // Сортировка по start_date
  const sortedItems = scheduleItems ? [...scheduleItems].sort((a, b) => {
    return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
  }) : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">График работ</h3>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setEditingItem(null);
        }}>
          <Button onClick={() => {
            setEditingItem(null);
            setIsDialogOpen(true);
          }} size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Добавить задачу
          </Button>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Редактировать задачу' : 'Новая задача'}</DialogTitle>
              <DialogDescription>
                {editingItem ? 'Измените детали задачи' : 'Добавьте новую задачу в график'}
              </DialogDescription>
            </DialogHeader>
            <ScheduleItemForm
              contractId={contractId}
              contract={contract}
              item={editingItem}
              onSubmit={(data) => {
                if (editingItem) {
                  updateMutation.mutate({ id: editingItem.id, data });
                } else {
                  createMutation.mutate(data);
                }
              }}
              isLoading={createMutation.isPending || updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {!sortedItems || sortedItems.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">Нет задач в графике</p>
          <Button onClick={() => setIsDialogOpen(true)} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Добавить первую задачу
          </Button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Наименование работ
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Начало
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Окончание
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Рабочих
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="text-sm font-medium text-gray-900">{item.name}</div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Calendar className="w-3 h-3" />
                        {formatDate(item.start_date)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Calendar className="w-3 h-3" />
                        {formatDate(item.end_date)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Users className="w-4 h-4" />
                        {item.workers_count}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(item.status)}`}>
                        {getStatusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => handleEdit(item)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Редактировать
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(item)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface ScheduleItemFormProps {
  contractId: number;
  contract?: ContractDetail;
  item?: WorkScheduleItem | null;
  onSubmit: (data: CreateWorkScheduleItemData) => void;
  isLoading: boolean;
}

function ScheduleItemForm({ contractId, contract, item, onSubmit, isLoading }: ScheduleItemFormProps) {
  const [formData, setFormData] = useState<CreateWorkScheduleItemData>({
    contract: contractId,
    name: item?.name || '',
    start_date: item?.start_date || new Date().toISOString().split('T')[0],
    end_date: item?.end_date || new Date().toISOString().split('T')[0],
    workers_count: item?.workers_count || 0,
  });

  const [status, setStatus] = useState(item?.status || 'pending');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.start_date || !formData.end_date) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    // Валидация: даты должны быть внутри дат договора
    if (contract) {
      const taskStart = new Date(formData.start_date);
      const taskEnd = new Date(formData.end_date);
      const contractStart = contract.start_date ? new Date(contract.start_date) : null;
      const contractEnd = contract.end_date ? new Date(contract.end_date) : null;

      if (contractStart && taskStart < contractStart) {
        toast.error('Дата начала задачи не может быть раньше даты начала договора');
        return;
      }

      if (contractEnd && taskEnd > contractEnd) {
        toast.error('Дата окончания задачи не может быть позже даты окончания договора');
        return;
      }

      if (taskStart > taskEnd) {
        toast.error('Дата начала не может быть позже даты окончания');
        return;
      }
    }

    onSubmit({
      ...formData,
      ...(item && { status } as any), // Статус только при редактировании
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div>
        <Label htmlFor="name">
          Наименование работ <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Например: Монтаж оборудования"
          disabled={isLoading}
          className="mt-1.5"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="start_date">
            Дата начала <span className="text-red-500">*</span>
          </Label>
          <Input
            id="start_date"
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            disabled={isLoading}
            className="mt-1.5"
            required
          />
        </div>

        <div>
          <Label htmlFor="end_date">
            Дата окончания <span className="text-red-500">*</span>
          </Label>
          <Input
            id="end_date"
            type="date"
            value={formData.end_date}
            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            disabled={isLoading}
            className="mt-1.5"
            required
          />
        </div>
      </div>

      <div>
        <Label htmlFor="workers_count">Количество рабочих</Label>
        <Input
          id="workers_count"
          type="number"
          min="0"
          value={formData.workers_count}
          onChange={(e) => setFormData({ ...formData, workers_count: parseInt(e.target.value) || 0 })}
          disabled={isLoading}
          className="mt-1.5"
        />
      </div>

      {item && (
        <div>
          <Label htmlFor="status">Статус</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="status" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Не начато</SelectItem>
              <SelectItem value="in_progress">В работе</SelectItem>
              <SelectItem value="done">Выполнено</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {contract && (contract.start_date || contract.end_date) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          <strong>Сроки договора:</strong>
          {contract.start_date && ` с ${formatDate(contract.start_date)}`}
          {contract.end_date && ` по ${formatDate(contract.end_date)}`}
        </div>
      )}

      <div className="flex gap-3 pt-4">
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {item ? 'Сохранение...' : 'Создание...'}
            </>
          ) : (
            item ? 'Сохранить изменения' : 'Добавить задачу'
          )}
        </Button>
      </div>
    </form>
  );
}