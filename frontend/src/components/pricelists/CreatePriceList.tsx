import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, CreatePriceListData } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { ArrowLeft, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { CONSTANTS } from '../../constants';

export function CreatePriceList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [populateRates, setPopulateRates] = useState(true);
  const [selectedWorkItems, setSelectedWorkItems] = useState<number[]>([]);
  const [sectionFilter, setSectionFilter] = useState<number | undefined>();
  const [gradeFilter, setGradeFilter] = useState<number | undefined>();

  const [formData, setFormData] = useState<CreatePriceListData>({
    number: '',
    name: '',
    date: new Date().toISOString().split('T')[0],
    status: 'draft',
    grade_1_rate: '',
    grade_2_rate: '',
    grade_3_rate: '',
    grade_4_rate: '',
    grade_5_rate: '',
    work_items: [],
    populate_rates: true,
  });

  const { data: grades } = useQuery({
    queryKey: ['worker-grades-active'],
    queryFn: () => api.getWorkerGrades(true),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: sections } = useQuery({
    queryKey: ['work-sections-active'],
    queryFn: () => api.getWorkSections(false).then((sections) => sections.filter((s) => s.is_active)),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: workItems } = useQuery({
    queryKey: ['work-items-current'],
    queryFn: () => api.getWorkItems().then((items) => items.filter((i) => i.is_current)),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Автозаполнение ставок из справочника только при первой загрузке
  useEffect(() => {
    if (populateRates && grades && grades.length >= 5) {
      // Проверяем, что ставки еще не заполнены
      if (!formData.grade_1_rate && !formData.grade_2_rate) {
        const sortedGrades = [...grades].sort((a, b) => a.grade - b.grade);
        setFormData((prev) => ({
          ...prev,
          grade_1_rate: sortedGrades.find((g) => g.grade === 1)?.default_hourly_rate || '',
          grade_2_rate: sortedGrades.find((g) => g.grade === 2)?.default_hourly_rate || '',
          grade_3_rate: sortedGrades.find((g) => g.grade === 3)?.default_hourly_rate || '',
          grade_4_rate: sortedGrades.find((g) => g.grade === 4)?.default_hourly_rate || '',
          grade_5_rate: sortedGrades.find((g) => g.grade === 5)?.default_hourly_rate || '',
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grades]); // Запускаем только когда загружаются grades

  // Обработка переключения чекбокса автозаполнения
  const handlePopulateRatesChange = (checked: boolean | 'indeterminate') => {
    const isChecked = checked === true;
    setPopulateRates(isChecked);
    
    if (isChecked && grades && grades.length >= 5) {
      const sortedGrades = [...grades].sort((a, b) => a.grade - b.grade);
      setFormData((prev) => ({
        ...prev,
        grade_1_rate: sortedGrades.find((g) => g.grade === 1)?.default_hourly_rate || '',
        grade_2_rate: sortedGrades.find((g) => g.grade === 2)?.default_hourly_rate || '',
        grade_3_rate: sortedGrades.find((g) => g.grade === 3)?.default_hourly_rate || '',
        grade_4_rate: sortedGrades.find((g) => g.grade === 4)?.default_hourly_rate || '',
        grade_5_rate: sortedGrades.find((g) => g.grade === 5)?.default_hourly_rate || '',
      }));
    } else if (!isChecked) {
      setFormData((prev) => ({
        ...prev,
        grade_1_rate: '',
        grade_2_rate: '',
        grade_3_rate: '',
        grade_4_rate: '',
        grade_5_rate: '',
      }));
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: CreatePriceListData) => api.createPriceList(data),
    onSuccess: (newPriceList) => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
      toast.success(`Прайс-лист создан: ${newPriceList.number}`);
      navigate(`/price-lists/${newPriceList.id}`);
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.number.trim() || !formData.date) {
      toast.error('Заполните номер и дату прайс-листа');
      return;
    }

    if (
      !formData.grade_1_rate ||
      !formData.grade_2_rate ||
      !formData.grade_3_rate ||
      !formData.grade_4_rate ||
      !formData.grade_5_rate
    ) {
      toast.error('Укажите ставки для всех разрядов');
      return;
    }

    createMutation.mutate({
      ...formData,
      work_items: selectedWorkItems,
      populate_rates: populateRates,
    });
  };

  const toggleWorkItem = (id: number) => {
    setSelectedWorkItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedWorkItems.length === filteredWorkItems?.length) {
      setSelectedWorkItems([]);
    } else {
      setSelectedWorkItems(filteredWorkItems?.map((i) => i.id) || []);
    }
  };

  // Фильтрация работ
  const filteredWorkItems = workItems?.filter((item) => {
    if (sectionFilter && item.section !== sectionFilter) return false;
    if (gradeFilter && item.grade !== gradeFilter) return false;
    return true;
  });

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/price-lists')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад
        </Button>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Создать прайс-лист</h1>
          <p className="text-sm text-gray-500 mt-1">
            Заполните основную информацию и выберите работы
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Основная информация */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Основная информация</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="number">Номер *</Label>
              <Input
                id="number"
                value={formData.number}
                onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                placeholder="PL-001"
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="name">Название</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Прайс-лист 2025"
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

            <div>
              <Label htmlFor="status">Статус</Label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value as any })
                }
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="draft">Черновик</option>
                <option value="active">Действующий</option>
                <option value="archived">Архивный</option>
              </select>
            </div>
          </div>
        </div>

        {/* Ставки по разрядам */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Ставки по разрядам</h3>
            <div className="flex items-center gap-2">
              <Checkbox
                id="populateRates"
                checked={populateRates}
                onCheckedChange={handlePopulateRatesChange}
              />
              <Label htmlFor="populateRates" className="cursor-pointer">
                Заполнить из справочника
              </Label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((grade) => (
              <div key={grade}>
                <Label htmlFor={`grade_${grade}_rate`}>Разряд {grade} *</Label>
                <Input
                  id={`grade_${grade}_rate`}
                  type="number"
                  step="0.01"
                  value={formData[`grade_${grade}_rate` as keyof CreatePriceListData] as string}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      [`grade_${grade}_rate`]: e.target.value,
                    })
                  }
                  placeholder="500.00"
                  disabled={populateRates}
                  required
                  className="mt-1.5"
                />
              </div>
            ))}
          </div>

          {populateRates && (
            <p className="text-xs text-blue-600 mt-3">
              Ставки заполнены автоматически из справочника разрядов
            </p>
          )}
        </div>

        {/* Выбор работ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Выбор работ</h3>

          {/* Фильтры */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label htmlFor="sectionFilter">Фильтр по разделу</Label>
              <select
                id="sectionFilter"
                value={sectionFilter || ''}
                onChange={(e) =>
                  setSectionFilter(e.target.value ? Number(e.target.value) : undefined)
                }
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Все разделы</option>
                {sections?.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.code} - {section.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="gradeFilter">Фильтр по разряду</Label>
              <select
                id="gradeFilter"
                value={gradeFilter || ''}
                onChange={(e) =>
                  setGradeFilter(e.target.value ? Number(e.target.value) : undefined)
                }
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Все разряды</option>
                {grades?.map((grade) => (
                  <option key={grade.id} value={grade.id}>
                    {grade.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={toggleAll} className="w-full">
                {selectedWorkItems.length === filteredWorkItems?.length
                  ? 'Снять все'
                  : 'Выбрать все'}
              </Button>
            </div>
          </div>

          {/* Таблица работ */}
          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-medium text-gray-500 uppercase">Выбрать</span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Артикул
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Наименование
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Раздел
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Разряд
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredWorkItems && filteredWorkItems.length > 0 ? (
                  filteredWorkItems.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-gray-50 ${
                        selectedWorkItems.includes(item.id) ? 'bg-blue-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedWorkItems.includes(item.id)}
                          onCheckedChange={() => toggleWorkItem(item.id)}
                        />
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => toggleWorkItem(item.id)}>
                        <span className="text-xs font-mono text-gray-700">{item.article}</span>
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => toggleWorkItem(item.id)}>
                        <span className="text-sm text-gray-900">{item.name}</span>
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => toggleWorkItem(item.id)}>
                        <span className="text-sm text-gray-600">{item.section_name}</span>
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => toggleWorkItem(item.id)}>
                        <span className="text-sm text-gray-600">{item.grade}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      Работы не найдены
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-sm text-gray-600 mt-3">
            Выбрано работ: {selectedWorkItems.length}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/price-lists')}
            disabled={createMutation.isPending}
          >
            Отмена
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Создание...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Создать прайс-лист
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}