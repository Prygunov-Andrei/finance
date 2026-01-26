import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, ProjectList, ConstructionObject } from '../../lib/api';
import { formatDate } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Plus, Search, FileText, Loader2, Filter, X } from 'lucide-react';
import { toast } from 'sonner';

export function Projects() {
  const navigate = useNavigate();
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  // Фильтры
  const [filters, setFilters] = useState({
    object: undefined as number | undefined,
    stage: undefined as 'П' | 'РД' | undefined,
    is_approved_for_production: undefined as boolean | undefined,
    primary_check_done: undefined as boolean | undefined,
    secondary_check_done: undefined as boolean | undefined,
    search: '',
  });

  const [formData, setFormData] = useState({
    cipher: '',
    name: '',
    date: new Date().toISOString().split('T')[0],
    stage: 'П' as 'П' | 'РД',
    object: 0,
    notes: '',
    file: null as File | null,
  });

  const { data: projects, isLoading, refetch } = useQuery({
    queryKey: ['projects', filters],
    queryFn: () => api.getProjects(filters),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: objects } = useQuery({
    queryKey: ['construction-objects'],
    queryFn: () => api.getConstructionObjects(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.file) {
      toast.error('Необходимо загрузить ZIP-архив проекта');
      return;
    }

    const formDataToSend = new FormData();
    formDataToSend.append('cipher', formData.cipher);
    formDataToSend.append('name', formData.name);
    formDataToSend.append('date', formData.date);
    formDataToSend.append('stage', formData.stage);
    formDataToSend.append('object', formData.object.toString());
    if (formData.notes) formDataToSend.append('notes', formData.notes);
    formDataToSend.append('file', formData.file);

    try {
      const created = await api.createProject(formDataToSend);
      toast.success('Проект создан');
      setCreateDialogOpen(false);
      resetForm();
      refetch();
      navigate(`/estimates/projects/${created.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка при создании проекта');
    }
  };

  const resetForm = () => {
    setFormData({
      cipher: '',
      name: '',
      date: new Date().toISOString().split('T')[0],
      stage: 'П',
      object: 0,
      notes: '',
      file: null,
    });
  };

  const clearFilters = () => {
    setFilters({
      object: undefined,
      stage: undefined,
      is_approved_for_production: undefined,
      primary_check_done: undefined,
      secondary_check_done: undefined,
      search: '',
    });
  };

  const hasActiveFilters = () => {
    return filters.object || filters.stage || filters.is_approved_for_production !== undefined ||
           filters.primary_check_done !== undefined || filters.secondary_check_done !== undefined ||
           filters.search;
  };

  const getStatusBadge = (status: boolean, label: string) => {
    return status ? (
      <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700">
        ✓ {label}
      </span>
    ) : (
      <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-600">
        ✗ {label}
      </span>
    );
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Проекты</h1>
          <p className="text-sm text-gray-500 mt-1">
            Управление проектной и рабочей документацией
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Создать проект
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Поиск по шифру или названию..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="pl-10"
              />
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? 'bg-gray-100' : ''}
          >
            <Filter className="w-4 h-4 mr-2" />
            Фильтры
            {hasActiveFilters() && <span className="ml-2 bg-blue-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">!</span>}
          </Button>
          {hasActiveFilters() && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="w-4 h-4 mr-2" />
              Сбросить
            </Button>
          )}
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
            <div>
              <Label>Объект</Label>
              <select
                value={filters.object || ''}
                onChange={(e) => setFilters({ ...filters, object: e.target.value ? Number(e.target.value) : undefined })}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Все объекты</option>
                {objects?.map((obj) => (
                  <option key={obj.id} value={obj.id}>{obj.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Стадия</Label>
              <select
                value={filters.stage || ''}
                onChange={(e) => setFilters({ ...filters, stage: e.target.value ? e.target.value as 'П' | 'РД' : undefined })}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Все стадии</option>
                <option value="П">Проектная документация (П)</option>
                <option value="РД">Рабочая документация (РД)</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label>Статусы</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.is_approved_for_production === true}
                    onChange={(e) => setFilters({ ...filters, is_approved_for_production: e.target.checked ? true : undefined })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">В производство</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.primary_check_done === true}
                    onChange={(e) => setFilters({ ...filters, primary_check_done: e.target.checked ? true : undefined })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">Первичная проверка</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.secondary_check_done === true}
                    onChange={(e) => setFilters({ ...filters, secondary_check_done: e.target.checked ? true : undefined })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">Вторичная проверка</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Шифр</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Название</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Объект</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Стадия</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Проверки</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Производство</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Версия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {projects.map((project) => (
                  <tr
                    key={project.id}
                    onClick={() => navigate(`/estimates/projects/${project.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">{project.cipher}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-900">{project.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{project.object_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{formatDate(project.date)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-blue-100 text-blue-700">
                        {project.stage_display}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {getStatusBadge(project.primary_check_done, '1')}
                        {getStatusBadge(project.secondary_check_done, '2')}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {project.is_approved_for_production ? (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700">
                          ✓ Разрешено
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-600">
                          ✗ Нет
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">v{project.version_number}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Нет проектов</p>
            <Button variant="outline" onClick={() => setCreateDialogOpen(true)} className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Создать первый проект
            </Button>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Создать проект</DialogTitle>
            <DialogDescription>
              Создайте новый проект с загрузкой ZIP-архива документации
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cipher">Шифр проекта *</Label>
                <Input
                  id="cipher"
                  value={formData.cipher}
                  onChange={(e) => setFormData({ ...formData, cipher: e.target.value })}
                  placeholder="ПР-2025-001"
                  required
                  className="mt-1.5"
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
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="name">Название проекта *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Название проектной документации"
                required
                className="mt-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="stage">Стадия *</Label>
                <select
                  id="stage"
                  value={formData.stage}
                  onChange={(e) => setFormData({ ...formData, stage: e.target.value as 'П' | 'РД' })}
                  className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="П">Проектная документация (П)</option>
                  <option value="РД">Рабочая документация (РД)</option>
                </select>
              </div>

              <div>
                <Label htmlFor="object">Объект *</Label>
                <select
                  id="object"
                  value={formData.object}
                  onChange={(e) => setFormData({ ...formData, object: Number(e.target.value) })}
                  className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value={0}>Выберите объект</option>
                  {objects?.map((obj) => (
                    <option key={obj.id} value={obj.id}>{obj.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="file">ZIP-архив проекта *</Label>
              <Input
                id="file"
                type="file"
                accept=".zip"
                onChange={(e) => setFormData({ ...formData, file: e.target.files?.[0] || null })}
                required
                className="mt-1.5"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Загрузите ZIP-архив с проектной документацией
              </p>
            </div>

            <div>
              <Label htmlFor="notes">Общие примечания</Label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                placeholder="Дополнительная информация о проекте"
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateDialogOpen(false);
                  resetForm();
                }}
              >
                Отмена
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                Создать проект
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}