import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, CreateWorkItemData, WorkSection } from '../../lib/api';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { ArrowLeft, FileText, Clock, Users, Loader2, Star, Hash, Edit2, Trash2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '../../lib/utils';
import { CONSTANTS } from '../../constants';

export function WorkItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showVersions, setShowVersions] = useState(false);
  const [isEditDialogOpen, setEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [formData, setFormData] = useState<CreateWorkItemData>({
    section: 0,
    name: '',
    unit: 'шт',
    hours: '',
    grade: '',
    coefficient: '1.00',
    composition: '',
    comment: '',
  });

  const { data: workItem, isLoading, error } = useQuery({
    queryKey: ['work-item', id],
    queryFn: () => api.getWorkItemDetail(Number(id)),
    enabled: !!id,
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: sections } = useQuery({
    queryKey: ['work-sections-active'],
    queryFn: () => api.getWorkSections(false).then((sections) => sections.filter((s: WorkSection) => s.is_active)),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
    enabled: isEditDialogOpen,
  });

  const { data: versions, isLoading: versionsLoading } = useQuery({
    queryKey: ['work-item-versions', id],
    queryFn: () => api.getWorkItemVersions(Number(id)),
    enabled: !!id && showVersions,
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const updateMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: Partial<CreateWorkItemData> }) =>
      api.updateWorkItem(itemId, data),
    onSuccess: (updatedItem) => {
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
      queryClient.invalidateQueries({ queryKey: ['work-item'] });
      setEditDialogOpen(false);
      toast.success(`Создана новая версия: ${updatedItem.article}`);
      navigate(`/work-items/${updatedItem.id}`);
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: number) => api.deleteWorkItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
      toast.success('Работа удалена');
      navigate('/work-items');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка удаления: ${error.message}`);
    },
  });

  const handleOpenEdit = () => {
    if (!workItem) return;
    setFormData({
      section: workItem.section_detail.id,
      name: workItem.name,
      unit: workItem.unit,
      hours: workItem.hours,
      grade: workItem.required_grade,
      coefficient: workItem.coefficient,
      composition: workItem.composition || '',
      comment: workItem.comment || '',
    });
    setEditDialogOpen(true);
  };

  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workItem) return;

    if (!formData.section || !formData.name.trim() || !formData.grade) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    if (formData.hours && parseFloat(formData.hours) < 0) {
      toast.error('Часы должны быть >= 0');
      return;
    }

    if (parseFloat(formData.coefficient) <= 0) {
      toast.error('Коэффициент должен быть больше нуля');
      return;
    }

    updateMutation.mutate({ itemId: workItem.id, data: formData });
  };

  const unitOptions = [
    { value: 'шт', label: 'Штука' },
    { value: 'м.п.', label: 'Метр погонный' },
    { value: 'м²', label: 'Квадратный метр' },
    { value: 'м³', label: 'Кубический метр' },
    { value: 'компл', label: 'Комплект' },
    { value: 'ед', label: 'Единица' },
    { value: 'ч', label: 'Час' },
    { value: 'кг', label: 'Килограмм' },
    { value: 'т', label: 'Тонна' },
  ];

  const formatGrade = (requiredGrade: string | undefined): string => {
    if (!requiredGrade) return '-';
    const gradeNum = parseFloat(requiredGrade);
    if (isNaN(gradeNum)) return '-';
    if (Number.isInteger(gradeNum)) return gradeNum.toString();
    return gradeNum.toFixed(2).replace(/\.?0+$/, '');
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !workItem) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Работа не найдена</p>
          <Button
            variant="outline"
            onClick={() => navigate('/work-items')}
            className="mt-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Вернуться к списку
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/work-items')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex px-3 py-1.5 text-sm font-mono font-medium rounded-lg bg-gray-100 text-gray-700">
                {workItem.article}
              </span>
              {workItem.is_current && (
                <span className="inline-flex px-3 py-1.5 text-sm font-medium rounded-lg bg-green-100 text-green-700">
                  Актуальная версия
                </span>
              )}
              <span className="text-sm text-gray-500">
                Версия {workItem.version_number}
              </span>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mt-2">
              {workItem.name}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {workItem.is_current && (
            <>
              <Button variant="outline" onClick={handleOpenEdit}>
                <Edit2 className="w-4 h-4 mr-2" />
                Редактировать
              </Button>
              <Button
                variant="outline"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Удалить
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => setShowVersions(!showVersions)}
          >
            {showVersions ? 'Скрыть историю' : 'История версий'}
          </Button>
        </div>
      </div>

      {/* Main Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Основная информация</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm text-gray-500">Раздел</div>
                <div className="font-medium text-gray-900">
                  {workItem.section_detail.code} - {workItem.section_detail.name}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Hash className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm text-gray-500">Единица измерения</div>
                <div className="font-medium text-gray-900">{workItem.unit}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm text-gray-500">Трудозатраты</div>
                <div className="font-medium text-gray-900">
                  {workItem.hours ? `${workItem.hours} часов` : '0 часов (не указано)'}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm text-gray-500">Разряд</div>
                <div className="font-medium text-gray-900">
                  {formatGrade(workItem.required_grade)}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Star className="w-5 h-5 text-gray-400 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm text-gray-500">Коэффициент</div>
                <div className="font-medium text-gray-900">{workItem.coefficient}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Метаданные</h3>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-gray-500">Версия</div>
              <div className="font-medium text-gray-900">v{workItem.version_number}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Статус</div>
              <div className="font-medium text-gray-900">
                {workItem.is_current ? (
                  <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700">
                    Актуальная
                  </span>
                ) : (
                  <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700">
                    Устаревшая
                  </span>
                )}
              </div>
            </div>
            {workItem.parent_version && (
              <div>
                <div className="text-sm text-gray-500">Родительская версия</div>
                <button
                  onClick={() => navigate(`/work-items/${workItem.parent_version}`)}
                  className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Перейти к версии #{workItem.parent_version}
                </button>
              </div>
            )}
            <div>
              <div className="text-sm text-gray-500">Создана</div>
              <div className="font-medium text-gray-900">{formatDateTime(workItem.created_at)}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Обновлена</div>
              <div className="font-medium text-gray-900">{formatDateTime(workItem.updated_at)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Composition */}
      {workItem.composition && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Состав работы</h3>
          <p className="text-gray-700 whitespace-pre-wrap">{workItem.composition}</p>
        </div>
      )}

      {/* Comment */}
      {workItem.comment && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Комментарий</h3>
          <p className="text-gray-700 whitespace-pre-wrap">{workItem.comment}</p>
        </div>
      )}

      {/* Version History */}
      {showVersions && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">История версий</h3>
          {versionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
          ) : versions && versions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Артикул
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Версия
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Дата создания
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Актуальная
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {versions.map((version) => (
                    <tr
                      key={version.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/work-items/${version.id}`)}
                    >
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-gray-700">
                          {version.article}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-900">
                          v{version.version_number}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-700">
                          {formatDateTime(version.created_at)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {version.is_current ? (
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700">
                            Да
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700">
                            Нет
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">Нет истории версий</p>
            </div>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Редактировать работу</DialogTitle>
            <DialogDescription>
              При сохранении будет создана новая версия работы
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitEdit} className="space-y-4">
            <div>
              <Label htmlFor="section">Раздел *</Label>
              <select
                id="section"
                value={formData.section}
                onChange={(e) => setFormData({ ...formData, section: Number(e.target.value) })}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value={0}>Выберите раздел</option>
                {sections?.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.code} - {section.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="name">Наименование *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="mt-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="unit">Единица измерения *</Label>
                <select
                  id="unit"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value as any })}
                  className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {unitOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="hours">Часы (опционально)</Label>
                <Input
                  id="hours"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.hours || ''}
                  onChange={(e) => setFormData({ ...formData, hours: e.target.value || null })}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="grade" className="flex items-center gap-2">
                  Разряд *
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger type="button">
                        <Info className="w-3.5 h-3.5 text-gray-400" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">
                          Можно указать целый (1-5) или дробный разряд (2.5, 3.65).
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input
                  id="grade"
                  type="number"
                  step="0.01"
                  min="1.00"
                  max="5.00"
                  value={formData.grade}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value && (parseFloat(value) < 1 || parseFloat(value) > 5)) {
                      toast.error('Разряд должен быть от 1.00 до 5.00');
                      return;
                    }
                    setFormData({ ...formData, grade: value });
                  }}
                  required
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="coefficient">Коэффициент *</Label>
                <Input
                  id="coefficient"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.coefficient}
                  onChange={(e) => setFormData({ ...formData, coefficient: e.target.value })}
                  required
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="composition">Состав работы (опционально)</Label>
              <textarea
                id="composition"
                value={formData.composition}
                onChange={(e) => setFormData({ ...formData, composition: e.target.value })}
                rows={3}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <Label htmlFor="comment">Комментарий (опционально)</Label>
              <textarea
                id="comment"
                value={formData.comment}
                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                rows={2}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                disabled={updateMutation.isPending}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  'Создать новую версию'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить работу?</AlertDialogTitle>
            <AlertDialogDescription>
              Работа <strong>{workItem.article}</strong> — «{workItem.name}» будет удалена. Это действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(workItem.id)}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Удаление...
                </>
              ) : (
                'Удалить'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
