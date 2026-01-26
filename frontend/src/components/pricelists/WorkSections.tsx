import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, WorkSection, CreateWorkSectionData } from '../../lib/api';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Plus, Edit2, Loader2, Search, List, Network } from 'lucide-react';
import { toast } from 'sonner';
import { CONSTANTS } from '../../constants';

export function WorkSections() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<WorkSection | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState<CreateWorkSectionData>({
    code: '',
    name: '',
    parent: null,
    sort_order: 0,
    is_active: true,
  });

  const { data: sections, isLoading } = useQuery({
    queryKey: ['work-sections', viewMode, searchQuery],
    queryFn: () => api.getWorkSections(viewMode === 'tree', searchQuery || undefined),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: allSections } = useQuery({
    queryKey: ['work-sections-all'],
    queryFn: () => api.getWorkSections(false),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateWorkSectionData) => api.createWorkSection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-sections'] });
      queryClient.invalidateQueries({ queryKey: ['work-sections-all'] });
      setDialogOpen(false);
      resetForm();
      toast.success('Раздел успешно создан');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateWorkSectionData> }) =>
      api.updateWorkSection(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-sections'] });
      queryClient.invalidateQueries({ queryKey: ['work-sections-all'] });
      setDialogOpen(false);
      resetForm();
      toast.success('Раздел успешно обновлен');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      parent: null,
      sort_order: 0,
      is_active: true,
    });
    setEditingSection(null);
  };

  const handleOpenDialog = (section?: WorkSection) => {
    if (section) {
      setEditingSection(section);
      setFormData({
        code: section.code,
        name: section.name,
        parent: section.parent,
        sort_order: section.sort_order,
        is_active: section.is_active,
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code.trim() || !formData.name.trim()) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    if (editingSection) {
      updateMutation.mutate({ id: editingSection.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const renderTreeNode = (section: WorkSection, level: number = 0) => (
    <div key={section.id}>
      <div
        className="hover:bg-gray-50 flex items-center border-b border-gray-200"
        style={{ paddingLeft: `${level * 24 + 24}px` }}
      >
        <div className="py-4 pr-6 flex-1">
          <div className="flex items-center gap-3">
            <span className="inline-flex px-2 py-1 text-xs font-mono font-medium rounded bg-gray-100 text-gray-700">
              {section.code}
            </span>
            <span className="font-medium text-gray-900">{section.name}</span>
          </div>
        </div>
        <div className="py-4 px-6">
          {section.parent_name && (
            <span className="text-sm text-gray-500">{section.parent_name}</span>
          )}
        </div>
        <div className="py-4 px-6">
          <span className="text-sm text-gray-500">{section.sort_order}</span>
        </div>
        <div className="py-4 px-6">
          {section.is_active ? (
            <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700">
              Активен
            </span>
          ) : (
            <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700">
              Неактивен
            </span>
          )}
        </div>
        <div className="py-4 px-6">
          <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(section)}>
            <Edit2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {section.children && section.children.map((child) => renderTreeNode(child, level + 1))}
    </div>
  );

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Разделы работ</h1>
          <p className="text-sm text-gray-500 mt-1">
            Справочник разделов с поддержкой иерархии
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Добавить раздел
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по коду и названию..."
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <List className="w-4 h-4" />
              Список
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'tree'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Network className="w-4 h-4" />
              Дерево
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-full">
            <div className="bg-gray-50 border-b border-gray-200 flex items-center">
              <div className="px-6 py-3 flex-1">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Код / Название
                </span>
              </div>
              <div className="px-6 py-3 w-48">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Родительский раздел
                </span>
              </div>
              <div className="px-6 py-3 w-32">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Порядок
                </span>
              </div>
              <div className="px-6 py-3 w-32">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Активен
                </span>
              </div>
              <div className="px-6 py-3 w-24">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Действия
                </span>
              </div>
            </div>

            {isLoading ? (
              <div className="px-6 py-12 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : sections && sections.length > 0 ? (
              viewMode === 'tree' ? (
                sections.map((section) => renderTreeNode(section))
              ) : (
                sections.map((section) => (
                  <div
                    key={section.id}
                    className="hover:bg-gray-50 flex items-center border-b border-gray-200"
                  >
                    <div className="px-6 py-4 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex px-2 py-1 text-xs font-mono font-medium rounded bg-gray-100 text-gray-700">
                          {section.code}
                        </span>
                        <span className="font-medium text-gray-900">{section.name}</span>
                      </div>
                    </div>
                    <div className="px-6 py-4 w-48">
                      {section.parent_name && (
                        <span className="text-sm text-gray-500">{section.parent_name}</span>
                      )}
                    </div>
                    <div className="px-6 py-4 w-32">
                      <span className="text-sm text-gray-500">{section.sort_order}</span>
                    </div>
                    <div className="px-6 py-4 w-32">
                      {section.is_active ? (
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700">
                          Активен
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700">
                          Неактивен
                        </span>
                      )}
                    </div>
                    <div className="px-6 py-4 w-24">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(section)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )
            ) : (
              <div className="px-6 py-12 text-center text-gray-500">
                Разделы не найдены
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingSection ? 'Редактировать раздел' : 'Добавить раздел'}
            </DialogTitle>
            <DialogDescription>
              {editingSection ? 'Обновите информацию о разделе' : 'Добавьте новый раздел'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="code">Код *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="VENT"
                required
                className="mt-1.5"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Уникальный код раздела (например, VENT, COND)
              </p>
            </div>

            <div>
              <Label htmlFor="name">Название *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Вентиляция"
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="parent">Родительский раздел</Label>
              <select
                id="parent"
                value={formData.parent || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    parent: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Без родителя (корневой раздел)</option>
                {allSections
                  ?.filter((s) => s.is_active && s.id !== editingSection?.id)
                  .map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.code} - {section.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <Label htmlFor="sort_order">Порядок сортировки</Label>
              <Input
                id="sort_order"
                type="number"
                value={formData.sort_order}
                onChange={(e) =>
                  setFormData({ ...formData, sort_order: Number(e.target.value) })
                }
                className="mt-1.5"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Порядок отображения раздела (по умолчанию 0)
              </p>
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
                ) : editingSection ? (
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