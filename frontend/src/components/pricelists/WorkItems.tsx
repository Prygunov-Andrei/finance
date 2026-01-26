import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, WorkItemList, CreateWorkItemData, WorkSection } from '../../lib/api';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Plus, Loader2, FileText, MessageSquare, Edit2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { CONSTANTS } from '../../constants';

export function WorkItems() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkItemList | null>(null);
  
  // Фильтры по разделам (двухуровневая система)
  const [selectedSection, setSelectedSection] = useState<number | null>(null); // Раздел верхнего уровня
  const [selectedSubsection, setSelectedSubsection] = useState<number | null>(null); // Подраздел

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

  const { data: workItems, isLoading, error, refetch } = useQuery({
    queryKey: ['work-items'],
    queryFn: () => api.getWorkItems(),
    retry: false,
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: sections } = useQuery({
    queryKey: ['work-sections-active'],
    queryFn: () => api.getWorkSections(false).then((sections) => sections.filter((s) => s.is_active)),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Функция для форматирования разряда
  const formatGrade = (requiredGrade: string | undefined): string => {
    if (!requiredGrade) {
      return '-';
    }
    
    const gradeNum = parseFloat(requiredGrade);
    if (isNaN(gradeNum)) {
      return '-';
    }
    
    // Если целое число, показываем без десятичных
    if (Number.isInteger(gradeNum)) {
      return gradeNum.toString();
    }
    
    // Для дробных - показываем с нужной точностью
    // Убираем лишние нули справа
    return gradeNum.toFixed(2).replace(/\.?0+$/, '');
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateWorkItemData) => api.createWorkItem(data),
    onSuccess: (newItem) => {
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
      setDialogOpen(false);
      resetForm();
      toast.success(`Работа создана. Артикл: ${newItem.article}`);
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateWorkItemData> }) =>
      api.updateWorkItem(id, data),
    onSuccess: (updatedItem) => {
      queryClient.invalidateQueries({ queryKey: ['work-items'] });
      setDialogOpen(false);
      resetForm();
      toast.success(`Работа обновлена. Создана новая версия: ${updatedItem.article}`);
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      section: 0,
      name: '',
      unit: 'шт',
      hours: '',
      grade: '',
      coefficient: '1.00',
      composition: '',
      comment: '',
    });
    setEditingItem(null);
  };

  const handleOpenDialog = (item?: WorkItemList) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        section: item.section,
        name: item.name,
        unit: item.unit,
        hours: item.hours,
        grade: item.required_grade, // Используем числовое значение разряда, а не ID
        coefficient: item.coefficient,
        composition: '',
        comment: '',
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.section || !formData.name.trim() || !formData.grade) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    // Валидация часов (если указано, должно быть >= 0)
    if (formData.hours && parseFloat(formData.hours) < 0) {
      toast.error('Часы должны быть >= 0');
      return;
    }

    if (parseFloat(formData.coefficient) <= 0) {
      toast.error('Коэффициент должен быть больше нуля');
      return;
    }

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
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

  // Построение иерархии разделов
  const parentSections = sections?.filter((s) => !s.parent) || [];
  const getSubsections = (parentId: number) => sections?.filter((s) => s.parent === parentId) || [];
  
  // Автоматически выбираем первый раздел и первый подраздел при загрузке
  useEffect(() => {
    if (parentSections.length > 0 && selectedSection === null) {
      const firstSection = parentSections[0];
      setSelectedSection(firstSection.id);
      
      const subsections = getSubsections(firstSection.id);
      if (subsections.length > 0) {
        setSelectedSubsection(subsections[0].id);
      }
    }
  }, [parentSections.length]);
  
  // Автоматически выбираем первый подраздел при смене раздела
  useEffect(() => {
    if (selectedSection) {
      const subsections = getSubsections(selectedSection);
      if (subsections.length > 0 && !selectedSubsection) {
        setSelectedSubsection(subsections[0].id);
      }
    }
  }, [selectedSection]);
  
  // Получаем все ID подразделов выбранного раздела для фильтрации
  const getSubsectionIds = (parentId: number): number[] => {
    const subsections = getSubsections(parentId);
    return subsections.map((s) => s.id);
  };

  // Фильтрация работ
  const filteredItems = workItems?.filter((item) => {
    // Фильтрация по разделам/подразделам
    if (selectedSubsection) {
      // Если выбран подраздел, показываем только работы этого подраздела
      return item.section === selectedSubsection && item.is_current;
    } else if (selectedSection) {
      // Если выбран только раздел, показываем работы всех его подразделов
      const subsectionIds = getSubsectionIds(selectedSection);
      return (subsectionIds.includes(item.section) || item.section === selectedSection) && item.is_current;
    }
    // Если ничего не выбрано, показываем все актуальные работы
    return item.is_current;
  });

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Работы</h1>
          <p className="text-sm text-gray-500 mt-1">
            Справочник работ с автоматической генерацией артикулов
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Добавить работу
        </Button>
      </div>

      {/* Filters - Двухуровневая система разделов */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        {/* Уровень 1: Родительские разделы */}
        <div>
          <Tabs 
            value={selectedSection?.toString() || ''} 
            onValueChange={(v) => {
              setSelectedSection(Number(v));
              setSelectedSubsection(null); // Сбрасываем подраздел при смене раздела
            }}
          >
            <TabsList className="flex-wrap h-auto">
              {parentSections.map((section) => (
                <TabsTrigger key={section.id} value={section.id.toString()}>
                  {section.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Уровень 2: Подразделы выбранного раздела */}
        {selectedSection && getSubsections(selectedSection).length > 0 && (
          <div>
            <Tabs 
              value={selectedSubsection?.toString() || ''} 
              onValueChange={(v) => {
                setSelectedSubsection(Number(v));
              }}
            >
              <TabsList className="flex-wrap h-auto">
                {getSubsections(selectedSection).map((subsection) => (
                  <TabsTrigger key={subsection.id} value={subsection.id.toString()}>
                    {subsection.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Артикул
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Наименование
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ед.изм.
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Часы
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Разряд
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Коэфф.
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12">
                    <div className="flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                    </div>
                  </td>
                </tr>
              ) : filteredItems && filteredItems.length > 0 ? (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2 py-1 text-xs font-mono font-medium rounded bg-gray-100 text-gray-700">
                        {item.article}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">{item.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{item.unit}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">{item.hours}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">
                        {formatGrade(item.required_grade)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">{item.coefficient}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {item.comment && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <MessageSquare className="w-4 h-4 text-blue-500" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs">{item.comment.length > 100 ? `${item.comment.slice(0, 100)}...` : item.comment}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/work-items/${item.id}`)}
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        {item.is_current && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(item)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    Работы не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Редактировать работу (создаст новую версию)' : 'Добавить работу'}
            </DialogTitle>
            <DialogDescription>
              {editingItem ? 'При сохранении изменений будет создана новая версия работы' : 'Артикул будет сгенерирован автоматически на основе кода раз��ела'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="Монтаж вентиляционного оборудования"
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
                  placeholder="Если не указано, используется 0"
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
                          Можно указать целый (1, 2, 3, 4, 5) или дробный разряд (например, 2.5, 3.65) для работ, 
                          выполняемых несколькими монтажниками с разными разрядами.
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
                    // Валидация: если заполнено, проверяем диапазон
                    if (value && (parseFloat(value) < 1 || parseFloat(value) > 5)) {
                      toast.error('Разряд должен быть от 1.00 до 5.00');
                      return;
                    }
                    setFormData({ ...formData, grade: value });
                  }}
                  placeholder="2.5, 3.0, 3.65"
                  required
                  className="mt-1.5"
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  Примеры: 2 (целый), 2.5 (средний), 3.65 (взвешенный)
                </p>
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
                  placeholder="1.00"
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
                placeholder="Опишите состав и этапы выполнения работы"
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
                placeholder="Дополнительные комментарии к работе"
                rows={2}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
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
                ) : editingItem ? (
                  'Создать новую версию'
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