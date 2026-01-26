import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, EstimateList } from '../../lib/api';
import { formatDate } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Plus, Search, FileText, Loader2, Filter, X } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_MAP = {
  draft: { label: 'Черновик', color: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'В работе', color: 'bg-blue-100 text-blue-700' },
  checking: { label: 'На проверке', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Утверждена', color: 'bg-green-100 text-green-700' },
  sent: { label: 'Отправлена Заказчику', color: 'bg-blue-100 text-blue-700' },
  agreed: { label: 'Согласована Заказчиком', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Отклонена', color: 'bg-red-100 text-red-700' },
};

export function Estimates() {
  const navigate = useNavigate();
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState({
    object: undefined as number | undefined,
    legal_entity: undefined as number | undefined,
    status: undefined as string | undefined,
    approved_by_customer: undefined as boolean | undefined,
    search: '',
  });

  const [formData, setFormData] = useState({
    object: 0,
    legal_entity: 0,
    name: '',
    with_vat: true,
    vat_rate: '20.00',
    projects: [] as number[],
    price_list: undefined as number | undefined,
    man_hours: '0.00',
    usd_rate: '',
    eur_rate: '',
    cny_rate: '',
  });

  const { data: estimates, isLoading, refetch } = useQuery({
    queryKey: ['estimates', filters],
    queryFn: () => api.getEstimates(filters),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: objects } = useQuery({
    queryKey: ['construction-objects'],
    queryFn: () => api.getConstructionObjects(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: legalEntities } = useQuery({
    queryKey: ['legal-entities'],
    queryFn: () => api.getLegalEntities(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: projects } = useQuery({
    queryKey: ['projects-all'],
    queryFn: () => api.getProjects(),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: priceLists } = useQuery({
    queryKey: ['price-lists'],
    queryFn: () => api.getPriceLists(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.object || !formData.legal_entity) {
      toast.error('Выберите объект и компанию');
      return;
    }

    const formDataToSend = {
      object: formData.object,
      legal_entity: formData.legal_entity,
      name: formData.name,
      with_vat: formData.with_vat,
      vat_rate: formData.with_vat ? formData.vat_rate : undefined,
      projects: formData.projects.length > 0 ? formData.projects : undefined,
      price_list: formData.price_list,
      man_hours: formData.man_hours,
      usd_rate: formData.usd_rate || undefined,
      eur_rate: formData.eur_rate || undefined,
      cny_rate: formData.cny_rate || undefined,
    };

    try {
      const created = await api.createEstimate(formDataToSend);
      toast.success('Смета создана');
      setCreateDialogOpen(false);
      resetForm();
      refetch();
      navigate(`/estimates/estimates/${created.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка при создании сметы');
    }
  };

  const resetForm = () => {
    setFormData({
      object: 0,
      legal_entity: 0,
      name: '',
      with_vat: true,
      vat_rate: '20.00',
      projects: [],
      price_list: undefined,
      man_hours: '0.00',
      usd_rate: '',
      eur_rate: '',
      cny_rate: '',
    });
  };

  const clearFilters = () => {
    setFilters({
      object: undefined,
      legal_entity: undefined,
      status: undefined,
      approved_by_customer: undefined,
      search: '',
    });
  };

  const hasActiveFilters = () => {
    return filters.object || filters.legal_entity || filters.status ||
           filters.approved_by_customer !== undefined || filters.search;
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Сметы</h1>
          <p className="text-sm text-gray-500 mt-1">
            Управление сметами с разделами и характеристиками
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Создать смету
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
                {objects?.map((obj) => (
                  <option key={obj.id} value={obj.id}>{obj.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Компания</Label>
              <select
                value={filters.legal_entity || ''}
                onChange={(e) => setFilters({ ...filters, legal_entity: e.target.value ? Number(e.target.value) : undefined })}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Все компании</option>
                {legalEntities?.map((le) => (
                  <option key={le.id} value={le.id}>{le.name}</option>
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
              <Label>Согласовано</Label>
              <label className="flex items-center gap-2 cursor-pointer mt-1.5">
                <input
                  type="checkbox"
                  checked={filters.approved_by_customer === true}
                  onChange={(e) => setFilters({ ...filters, approved_by_customer: e.target.checked ? true : undefined })}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">Согласовано Заказчиком</span>
              </label>
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
        ) : estimates && estimates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Номер</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Название</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Объект</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Компания</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">С НДС</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Согласовано</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Версия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {estimates.map((estimate) => (
                  <tr
                    key={estimate.id}
                    onClick={() => navigate(`/estimates/estimates/${estimate.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">{estimate.number}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-gray-900">{estimate.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{estimate.object_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">{estimate.legal_entity_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-md ${STATUS_MAP[estimate.status as keyof typeof STATUS_MAP]?.color}`}>
                        {STATUS_MAP[estimate.status as keyof typeof STATUS_MAP]?.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {estimate.with_vat ? (
                        <span className="text-sm text-green-600">✓ Да</span>
                      ) : (
                        <span className="text-sm text-gray-500">✗ Нет</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {estimate.approved_by_customer ? (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700">
                          ✓ Да
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-600">
                          ✗ Нет
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">v{estimate.version_number}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Нет смет</p>
            <Button variant="outline" onClick={() => setCreateDialogOpen(true)} className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Создать первую смету
            </Button>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Создать смету</DialogTitle>
            <DialogDescription>
              Создайте новую смету для объекта
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                  {objects?.map((obj) => (
                    <option key={obj.id} value={obj.id}>{obj.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="legal_entity">Наша компания *</Label>
                <select
                  id="legal_entity"
                  value={formData.legal_entity}
                  onChange={(e) => setFormData({ ...formData, legal_entity: Number(e.target.value) })}
                  className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value={0}>Выберите компанию</option>
                  {legalEntities?.map((le) => (
                    <option key={le.id} value={le.id}>{le.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="name">Название сметы *</Label>
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
                <Label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.with_vat}
                    onChange={(e) => setFormData({ ...formData, with_vat: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span>С НДС</span>
                </Label>
              </div>

              {formData.with_vat && (
                <div>
                  <Label htmlFor="vat_rate">Ставка НДС, %</Label>
                  <Input
                    id="vat_rate"
                    type="number"
                    step="0.01"
                    value={formData.vat_rate}
                    onChange={(e) => setFormData({ ...formData, vat_rate: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="projects">Проекты-основания (опционально)</Label>
              <select
                id="projects"
                multiple
                value={formData.projects.map(String)}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map(o => Number(o.value));
                  setFormData({ ...formData, projects: selected });
                }}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                size={3}
              >
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>{p.cipher} - {p.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Удерживайте Ctrl для множественного выбора</p>
            </div>

            <div>
              <Label htmlFor="price_list">Прайс-лист для расчёта (опционально)</Label>
              <select
                id="price_list"
                value={formData.price_list || ''}
                onChange={(e) => setFormData({ ...formData, price_list: e.target.value ? Number(e.target.value) : undefined })}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Не выбрано</option>
                {priceLists?.map((pl) => (
                  <option key={pl.id} value={pl.id}>{pl.number} - {pl.name}</option>
                ))}
              </select>
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

            <div>
              <Label>Курсы валют (опционально)</Label>
              <div className="grid grid-cols-3 gap-3 mt-1.5">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="USD"
                  value={formData.usd_rate}
                  onChange={(e) => setFormData({ ...formData, usd_rate: e.target.value })}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="EUR"
                  value={formData.eur_rate}
                  onChange={(e) => setFormData({ ...formData, eur_rate: e.target.value })}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="CNY"
                  value={formData.cny_rate}
                  onChange={(e) => setFormData({ ...formData, cny_rate: e.target.value })}
                />
              </div>
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
    </div>
  );
}