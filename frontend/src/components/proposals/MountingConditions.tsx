import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { api, MountingCondition, CreateMountingConditionData } from '../../lib/api';
import { CONSTANTS } from '../../constants';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';

export function MountingConditions() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(undefined);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MountingCondition | null>(null);
  const [formData, setFormData] = useState<CreateMountingConditionData>({
    name: '',
    description: '',
    is_active: true,
    is_default: false,
    sort_order: 0,
  });

  // Загрузка данных
  const { data: conditions, isLoading } = useQuery({
    queryKey: ['mounting-conditions', { search: searchQuery, is_active: activeFilter }],
    queryFn: () => api.getMountingConditions({
      search: searchQuery || undefined,
      is_active: activeFilter,
    }),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Мутации
  const createMutation = useMutation({
    mutationFn: (data: CreateMountingConditionData) => api.createMountingCondition(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mounting-conditions'] });
      toast.success('Условие создано');
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateMountingConditionData> }) =>
      api.updateMountingCondition(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mounting-conditions'] });
      toast.success('Условие обновлено');
      handleCloseDialog();
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteMountingCondition(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mounting-conditions'] });
      toast.success('Условие удалено');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleOpenDialog = (item?: MountingCondition) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        description: item.description || '',
        is_active: item.is_active,
        is_default: item.is_default,
        sort_order: item.sort_order,
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        description: '',
        is_active: true,
        is_default: false,
        sort_order: 0,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingItem(null);
    setFormData({
      name: '',
      description: '',
      is_active: true,
      is_default: false,
      sort_order: 0,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Название обязательно');
      return;
    }

    if (formData.name.length > 200) {
      toast.error('Название не должно превышать 200 символов');
      return;
    }

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm('Вы уверены, что хотите удалить это условие?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Заголовок */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl">Условия для МП</h1>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="w-4 h-4 mr-2" />
          Добавить условие
        </Button>
      </div>

      {/* Фильтры */}
      <div className="bg-white p-4 rounded-lg border space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Поиск по названию и описанию</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Введите текст для поиска..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div>
            <Label>Статус</Label>
            <select
              className="w-full px-3 py-2 border rounded-md"
              value={activeFilter === undefined ? 'all' : activeFilter.toString()}
              onChange={(e) => {
                const value = e.target.value;
                setActiveFilter(value === 'all' ? undefined : value === 'true');
              }}
            >
              <option value="all">Все</option>
              <option value="true">Только активные</option>
              <option value="false">Только неактивные</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setActiveFilter(undefined);
            }}
          >
            Сбросить фильтры
          </Button>
        </div>
      </div>

      {/* Таблица */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Название</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Описание</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Порядок</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">По умолч.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Активен</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Загрузка...
                  </td>
                </tr>
              ) : conditions && conditions.length > 0 ? (
                conditions.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-md text-gray-600 text-sm">
                        {item.description || <span className="text-gray-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.sort_order}</td>
                    <td className="px-4 py-3">
                      {item.is_default ? (
                        <Badge variant="default" className="bg-blue-100 text-blue-800">Да</Badge>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.is_active ? (
                        <Badge variant="default" className="bg-green-100 text-green-800">Да</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-gray-100 text-gray-800">Нет</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(item)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(item.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Нет данных
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Диалог создания/редактирования */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Редактировать условие' : 'Добавить условие'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Название *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Проживание, Инструмент, Питание..."
                maxLength={200}
                required
              />
              <div className="text-xs text-gray-500 mt-1">
                {formData.name.length} / 200 символов
              </div>
            </div>

            <div>
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Подробное описание условия..."
                rows={4}
              />
            </div>

            <div>
              <Label htmlFor="sort_order">Порядок сортировки</Label>
              <Input
                id="sort_order"
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked as boolean })}
                />
                <Label htmlFor="is_active" className="cursor-pointer">
                  Активен
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_default"
                  checked={formData.is_default}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked as boolean })}
                />
                <Label htmlFor="is_default" className="cursor-pointer">
                  По умолчанию
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Отмена
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingItem ? 'Сохранить' : 'Создать'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
