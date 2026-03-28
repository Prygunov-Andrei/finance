import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@/hooks/erp-router';
import { api, ProjectList, unwrapResults } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { CONSTANTS } from '@/constants';
import { useObjects } from '@/hooks/useReferenceData';
import { useProjectFileTypes } from '@/hooks/useReferenceData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Plus, PlusCircle, Search, FileText, Loader2, Filter, X, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { QuickCreateObjectDialog } from '../kanban/QuickCreateObjectDialog';

type FileEntry = {
  file: File;
  file_type: number;
  title: string;
};

export function Projects() {
  const navigate = useNavigate();
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreateObjectOpen, setCreateObjectOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  });

  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);

  const { data: projects, isLoading, refetch } = useQuery({
    queryKey: ['projects', filters],
    queryFn: () => api.estimates.getProjects(filters),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: objectsData } = useObjects();
  const objects = unwrapResults(objectsData);

  const { data: fileTypes } = useProjectFileTypes();
  const defaultFileTypeId = fileTypes?.[0]?.id ?? 0;

  const handleAddFiles = (files: FileList | null) => {
    if (!files) return;
    const newEntries: FileEntry[] = Array.from(files).map((file) => ({
      file,
      file_type: defaultFileTypeId,
      title: '',
    }));
    setFileEntries((prev) => [...prev, ...newEntries]);
  };

  const handleRemoveFile = (index: number) => {
    setFileEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileEntryChange = (index: number, field: keyof FileEntry, value: string | number) => {
    setFileEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.object === 0) {
      toast.error('Выберите объект');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Создаём проект (без файлов)
      const projectFormData = new FormData();
      projectFormData.append('cipher', formData.cipher);
      projectFormData.append('name', formData.name);
      projectFormData.append('date', formData.date);
      projectFormData.append('stage', formData.stage);
      projectFormData.append('object', formData.object.toString());
      if (formData.notes) projectFormData.append('notes', formData.notes);

      const created = await api.estimates.createProject(projectFormData);

      // 2. Загружаем файлы (последовательно)
      for (const entry of fileEntries) {
        const fileFormData = new FormData();
        fileFormData.append('project', created.id.toString());
        fileFormData.append('file', entry.file);
        fileFormData.append('file_type', entry.file_type.toString());
        if (entry.title) fileFormData.append('title', entry.title);
        await api.estimates.uploadProjectFile(fileFormData);
      }

      toast.success('Проект создан');
      setCreateDialogOpen(false);
      resetForm();
      refetch();
      navigate(`/estimates/projects/${created.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка при создании проекта');
    } finally {
      setIsSubmitting(false);
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
    });
    setFileEntries([]);
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
      <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
        ✓ {label}
      </span>
    ) : (
      <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground">
        ✗ {label}
      </span>
    );
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Проекты</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Управление проектной и рабочей документацией
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Создать проект
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="bg-card rounded-xl shadow-sm border border-border p-4 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
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
            className={showFilters ? 'bg-muted' : ''}
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
                className="mt-1.5 w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Все объекты</option>
                {objects.map((obj) => (
                  <option key={obj.id} value={obj.id}>{obj.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Стадия</Label>
              <select
                value={filters.stage || ''}
                onChange={(e) => setFilters({ ...filters, stage: e.target.value ? e.target.value as 'П' | 'РД' : undefined })}
                className="mt-1.5 w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
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
                    className="rounded border-border"
                  />
                  <span className="text-sm">В производство</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.primary_check_done === true}
                    onChange={(e) => setFilters({ ...filters, primary_check_done: e.target.checked ? true : undefined })}
                    className="rounded border-border"
                  />
                  <span className="text-sm">Первичная проверка</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.secondary_check_done === true}
                    onChange={(e) => setFilters({ ...filters, secondary_check_done: e.target.checked ? true : undefined })}
                    className="rounded border-border"
                  />
                  <span className="text-sm">Вторичная проверка</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Шифр</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Название</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Объект</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Дата</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Стадия</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Проверки</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Производство</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Версия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projects.map((project) => (
                  <tr
                    key={project.id}
                    onClick={() => navigate(`/estimates/projects/${project.id}`)}
                    className="hover:bg-muted cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="font-medium text-foreground">{project.cipher}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-foreground">{project.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground">{project.object_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground">{formatDate(project.date)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-blue-100 dark:bg-blue-900/30 text-primary">
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
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                          ✓ Разрешено
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground">
                          ✗ Нет
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground">v{project.version_number}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Нет проектов</p>
            <Button variant="outline" onClick={() => setCreateDialogOpen(true)} className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Создать первый проект
            </Button>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => { if (!open) { setCreateDialogOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Создать проект</DialogTitle>
            <DialogDescription>
              Создайте новый проект с загрузкой документации
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
                  className="mt-1.5 w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  <option value="П">Проектная документация (П)</option>
                  <option value="РД">Рабочая документация (РД)</option>
                </select>
              </div>

              <div>
                <Label htmlFor="object">Объект *</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <select
                    id="object"
                    value={formData.object}
                    onChange={(e) => setFormData({ ...formData, object: Number(e.target.value) })}
                    className="flex-1 px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  >
                    <option value={0}>Выберите объект</option>
                    {objects.map((obj) => (
                      <option key={obj.id} value={obj.id}>{obj.name}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setCreateObjectOpen(true)}
                    title="Создать новый объект"
                    className="shrink-0"
                  >
                    <PlusCircle className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Файлы проекта */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Файлы проекта</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-1"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Добавить файлы
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => { handleAddFiles(e.target.files); e.target.value = ''; }}
                  className="hidden"
                />
              </div>

              {fileEntries.length === 0 ? (
                <div
                  className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleAddFiles(e.dataTransfer.files); }}
                >
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Перетащите файлы сюда или нажмите для выбора
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF, ZIP, DWG и другие форматы
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {fileEntries.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 border border-border rounded-lg bg-muted/30">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate min-w-0 flex-shrink" title={entry.file.name}>
                        {entry.file.name}
                      </span>
                      <select
                        value={entry.file_type}
                        onChange={(e) => handleFileEntryChange(index, 'file_type', Number(e.target.value))}
                        className="px-2 py-1 text-sm border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
                      >
                        {fileTypes?.map((ft) => (
                          <option key={ft.id} value={ft.id}>{ft.name}</option>
                        ))}
                      </select>
                      <Input
                        value={entry.title}
                        onChange={(e) => handleFileEntryChange(index, 'title', e.target.value)}
                        placeholder="Название (опц.)"
                        className="h-8 text-sm w-36 shrink-0"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-500"
                        onClick={() => handleRemoveFile(index)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Ещё файл
                  </Button>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="notes">Общие примечания</Label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                placeholder="Дополнительная информация о проекте"
                className="mt-1.5 w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
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
              <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Создание...
                  </>
                ) : (
                  'Создать проект'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick Create Object Dialog */}
      <QuickCreateObjectDialog
        open={isCreateObjectOpen}
        onOpenChange={setCreateObjectOpen}
        onCreated={(obj) => {
          setFormData((prev) => ({ ...prev, object: obj.id }));
        }}
      />
    </div>
  );
}
