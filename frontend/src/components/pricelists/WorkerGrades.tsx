import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, WorkerGrade, CreateWorkerGradeData } from '../../lib/api';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Plus, Edit2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '../../lib/utils';
import { CONSTANTS } from '../../constants';

export function WorkerGrades() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [editingGrade, setEditingGrade] = useState<WorkerGrade | null>(null);
  const [showOnlyActive, setShowOnlyActive] = useState(false);

  const [formData, setFormData] = useState<CreateWorkerGradeData>({
    grade: 1,
    name: '',
    default_hourly_rate: '',
    is_active: true,
  });

  const { data: grades, isLoading, error } = useQuery({
    queryKey: ['worker-grades'],
    queryFn: () => api.getWorkerGrades(),
    retry: false,
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateWorkerGradeData) => api.createWorkerGrade(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-grades'] });
      setDialogOpen(false);
      resetForm();
      toast.success('Разряд успешно создан');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateWorkerGradeData> }) =>
      api.updateWorkerGrade(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worker-grades'] });
      setDialogOpen(false);
      resetForm();
      toast.success('Разряд успешно обновлен');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      grade: 1,
      name: '',
      default_hourly_rate: '',
      is_active: true,
    });
    setEditingGrade(null);
  };

  const handleOpenDialog = (grade?: WorkerGrade) => {
    if (grade) {
      setEditingGrade(grade);
      setFormData({
        grade: grade.grade,
        name: grade.name,
        default_hourly_rate: grade.default_hourly_rate,
        is_active: grade.is_active,
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.default_hourly_rate) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    if (editingGrade) {
      updateMutation.mutate({ id: editingGrade.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Разряды рабочих</h1>
          <p className="text-sm text-gray-500 mt-1">
            Справочник разрядов с базовыми ставками
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Добавить разряд
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="showOnlyActive"
            checked={showOnlyActive}
            onCheckedChange={(checked) => setShowOnlyActive(checked as boolean)}
          />
          <Label htmlFor="showOnlyActive" className="cursor-pointer">
            Показать только активные
          </Label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Разряд
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Название
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ставка (руб/ч)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Активен
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Действия
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12">
                  <div className="flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  </div>
                </td>
              </tr>
            ) : grades && grades.length > 0 ? (
              grades.map((grade) => (
                <tr key={grade.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-semibold">
                      {grade.grade}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{grade.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">
                      {formatCurrency(grade.default_hourly_rate)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {grade.is_active ? (
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700">
                        Активен
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700">
                        Неактивен
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDialog(grade)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  Разряды не найдены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingGrade ? 'Редактировать разряд' : 'Добавить разряд'}
            </DialogTitle>
            <DialogDescription>
              {editingGrade ? 'Обновите информацию о разряде' : 'Добавьте новый разряд'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="grade">Разряд *</Label>
              <select
                id="grade"
                value={formData.grade}
                onChange={(e) => setFormData({ ...formData, grade: Number(e.target.value) })}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
              </select>
            </div>

            <div>
              <Label htmlFor="name">Название *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Монтажник 1 разряда"
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="default_hourly_rate">Базовая ставка (руб/ч) *</Label>
              <Input
                id="default_hourly_rate"
                type="number"
                step="0.01"
                value={formData.default_hourly_rate}
                onChange={(e) =>
                  setFormData({ ...formData, default_hourly_rate: e.target.value })
                }
                placeholder="500.00"
                required
                className="mt-1.5"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked as boolean })
                }
              />
              <Label htmlFor="is_active" className="cursor-pointer">
                Активен
              </Label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Сохранение...
                  </>
                ) : editingGrade ? (
                  'Обновить'
                ) : (
                  'Создать'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}