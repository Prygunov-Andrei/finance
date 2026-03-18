import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@/hooks/erp-router';
import { api, MountingEstimateList } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { CONSTANTS } from '../../constants';
import { useObjects } from '@/hooks/useReferenceData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Plus, Search, FileSpreadsheet, Loader2, Filter, X } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_MAP = {
  draft: { label: 'Черновик', color: 'bg-gray-100 text-gray-700' },
  sent: { label: 'Отправлена', color: 'bg-blue-100 text-blue-700' },
  approved: { label: 'Согласована', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Отклонена', color: 'bg-red-100 text-red-700' },
};

export function MountingEstimates() {
  const navigate = useNavigate();
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreateFromEstimateOpen, setCreateFromEstimateOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState({
    object: undefined as number | undefined,
    source_estimate: undefined as number | undefined,
    status: undefined as string | undefined,
    agreed_counterparty: undefined as number | undefined,
    search: '',
  });

  const [formData, setFormData] = useState({
    name: '',
    object: 0,
    source_estimate: undefined as number | undefined,
    total_amount: '0.00',
    man_hours: '0.00',
    status: 'draft' as 'draft' | 'sent' | 'approved' | 'rejected',
  });

  const [selectedEstimateForCreation, setSelectedEstimateForCreation] = useState<number>(0);

  const { data: mountingEstimates, isLoading, refetch } = useQuery({
    queryKey: ['mounting-estimates', filters],
    queryFn: () => api.getMountingEstimates(filters),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: objectsData } = useObjects();
  const objects = Array.isArray(objectsData)
    ? objectsData
    : (objectsData as any)?.results ?? [];

  const { data: estimates } = useQuery({
    queryKey: ['estimates-all'],
    queryFn: () => api.getEstimates(),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: counterparties } = useQuery({
    queryKey: ['counterparties'],
    queryFn: () => api.getCounterparties(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.object) {
      toast.error('Выберите объект');
      return;
    }

    try {
      const created = await api.createMountingEstimate({
        name: formData.name,
        object: formData.object,
        source_estimate: formData.source_estimate,
        total_amount: formData.total_amount,
        man_hours: formData.man_hours,
        status: formData.status,
      });
      toast.success('Монтажная смета создана');
      setCreateDialogOpen(false);
      resetForm();
      refetch();
      navigate(`/estimates/mounting-estimates/${created.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка при создании монтажной сметы');
    }
  };

  const handleCreateFromEstimate = async () => {
    if (!selectedEstimateForCreation) {
      toast.error('Выберите смету');
      return;
    }

    try {
      const created = await api.createMountingEstimateFromEstimateId(selectedEstimateForCreation);
      toast.success('Монтажная смета создана из сметы');
      setCreateFromEstimateOpen(false);
      setSelectedEstimateForCreation(0);
      refetch();
      navigate(`/estimates/mounting-estimates/${created.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка при создании монтажной сметы');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      object: 0,
      source_estimate: undefined,
      total_amount: '0.00',
      man_hours: '0.00',
      status: 'draft',
    });
  };

  const clearFilters = () => {
    setFilters({
      object: undefined,
      source_estimate: undefined,
      status: undefined,
      agreed_counterparty: undefined,
      search: '',
    });
  };

  const hasActiveFilters = () => {
    return filters.object || filters.source_estimate || filters.status ||
           filters.agreed_counterparty || filters.search;
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Монтажные сметы</h1>
          <p className="text-sm text-gray-500 mt-1">
            Упрощённые сметы для работы с Исполнителями
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCreateFromEstimateOpen(true)}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Создать из сметы
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Создать монтажную смету
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                type="text"
                placeholder="Поиск по номеру или названию..."
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

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t">
            <div>
              <Label>Объект</Label>
              <select
                value={filters.object || ''}
                onChange={(e) => setFilters({ ...filters, object: e.target.value ? Number(e.target.value) : undefined })}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Все объекты</option>
                {objects.map((obj: any) => (
                  <option key={obj.id} value={obj.id}>{obj.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Исходная смета</Label>
              <select
                value={filters.source_estimate || ''}
                onChange={(e) => setFilters({ ...filters, source_estimate: e.target.value ? Number(e.target.value) : undefined })}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Все сметы</option>
                {estimates?.map((est) => (
                  <option key={est.id} value={est.id}>{est.number} - {est.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Статус</Label>
              <select
                value={filters.status || ''}
                onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Все статусы</option>
                {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Исполнитель</Label>
              <select
                value={filters.agreed_counterparty || ''}
                onChange={(e) => setFilters({ ...filters, agreed_counterparty: e.target.value ? Number(e.target.value) : undefined })}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Все исполнители</option>
                {counterparties?.filter(c => c.type === 'supplier' || c.type === 'both').map((cp) => (
                  <option key={cp.id} value={cp.id}>{cp.name}</option>
                ))}
              </select>
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
        ) : mountingEstimates && mountingEstimates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Номер</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Название</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Объект</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Исходная смета</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Сумма</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Согласовано с</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Версия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {mountingEstimates.map((me) => (
                  <tr
                    key={me.id}
                    onClick={() => navigate(`/estimates/mounting-estimates/${me.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">{me.number}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-900">{me.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{me.object_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      {me.source_estimate ? (
                        <span className="text-sm text-blue-600">{me.source_estimate.number}</span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-medium text-gray-900">{formatCurrency(me.total_amount)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-md ${STATUS_MAP[me.status as keyof typeof STATUS_MAP]?.color}`}>
                        {STATUS_MAP[me.status as keyof typeof STATUS_MAP]?.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {me.agreed_date ? (
                        <span className="text-sm text-gray-600">
                          {formatDate(me.agreed_date)}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">v{me.version_number}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Нет монтажных смет</p>
            <div className="flex gap-2 justify-center mt-4">
              <Button variant="outline" onClick={() => setCreateFromEstimateOpen(true)}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Создать из сметы
              </Button>
              <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Создать вручную
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Создать монтажную смету</DialogTitle>
            <DialogDescription>
              Создайте новую монтажную смету вручную
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Название *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Введите название"
                required
                className="mt-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                  {objects.map((obj: any) => (
                    <option key={obj.id} value={obj.id}>{obj.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="source_estimate">Исходная смета (опционально)</Label>
                <select
                  id="source_estimate"
                  value={formData.source_estimate || ''}
                  onChange={(e) => setFormData({ ...formData, source_estimate: e.target.value ? Number(e.target.value) : undefined })}
                  className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Не выбрано</option>
                  {estimates?.map((est) => (
                    <option key={est.id} value={est.id}>{est.number} - {est.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="total_amount">Итоговая сумма без НДС *</Label>
                <Input
                  id="total_amount"
                  type="number"
                  step="0.01"
                  value={formData.total_amount}
                  onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                  required
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="man_hours">Человеко-часы</Label>
                <Input
                  id="man_hours"
                  type="number"
                  step="0.01"
                  value={formData.man_hours}
                  onChange={(e) => setFormData({ ...formData, man_hours: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="status">Статус</Label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
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
                Создать смету
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create from Estimate Dialog */}
      <Dialog open={isCreateFromEstimateOpen} onOpenChange={setCreateFromEstimateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Создать из сметы</DialogTitle>
            <DialogDescription>
              Выберите смету для создания монтажной сметы
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="select_estimate">Смета *</Label>
              <select
                id="select_estimate"
                value={selectedEstimateForCreation}
                onChange={(e) => setSelectedEstimateForCreation(Number(e.target.value))}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={0}>��ыберите смету</option>
                {estimates?.map((est) => (
                  <option key={est.id} value={est.id}>{est.number} - {est.name}</option>
                ))}
              </select>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <p>💡 Монтажная смета будет создана на основе работ (закупка) из выбранной сметы.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFromEstimateOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={handleCreateFromEstimate}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}