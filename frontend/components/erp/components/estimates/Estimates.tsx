import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@/hooks/erp-router';
import { api, EstimateList , unwrapResults} from '@/lib/api';
import { CONSTANTS } from '@/constants';
import { useObjects } from '@/hooks/useReferenceData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, FileText, Loader2, Filter, X, Download } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_MAP = {
  draft: { label: 'Черновик', color: 'bg-muted text-foreground' },
  in_progress: { label: 'В работе', color: 'bg-blue-100 dark:bg-blue-900/30 text-primary' },
  checking: { label: 'На проверке', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
  approved: { label: 'Утверждена', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  sent: { label: 'Отправлена Заказчику', color: 'bg-blue-100 dark:bg-blue-900/30 text-primary' },
  agreed: { label: 'Согласована Заказчиком', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  rejected: { label: 'Отклонена', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
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
    projects: [] as number[],
  });

  const { data: estimates, isLoading, refetch } = useQuery({
    queryKey: ['estimates', filters],
    queryFn: () => api.estimates.getEstimates(filters),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: objectsData, error: objectsError } = useObjects();
  const objects = unwrapResults(objectsData);

  const { data: legalEntities } = useQuery({
    queryKey: ['legal-entities'],
    queryFn: () => api.core.getLegalEntities(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: projects } = useQuery({
    queryKey: ['projects', formData.object],
    queryFn: () => api.estimates.getProjects({ object: formData.object }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
    enabled: formData.object > 0,
  });

  const handleLegalEntityChange = (entityId: number) => {
    setFormData(prev => ({ ...prev, legal_entity: entityId }));
  };

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
      projects: formData.projects.length > 0 ? formData.projects : undefined,
    };

    try {
      const created = await api.estimates.createEstimate(formDataToSend);
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
      projects: [],
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
          <h1 className="text-2xl font-semibold text-foreground">Сметы</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Управление сметами с разделами и характеристиками
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Создать смету
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

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t">
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
              <Label>Компания</Label>
              <select
                value={filters.legal_entity || ''}
                onChange={(e) => setFilters({ ...filters, legal_entity: e.target.value ? Number(e.target.value) : undefined })}
                className="mt-1.5 w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
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
                className="mt-1.5 w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
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
                  className="rounded border-border"
                />
                <span className="text-sm">Согласовано Заказчиком</span>
              </label>
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
        ) : estimates && estimates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Номер</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Название</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Объект</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Компания</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Статус</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">С НДС</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Согласовано</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Версия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {estimates.map((estimate) => (
                  <tr
                    key={estimate.id}
                    onClick={() => navigate(`/estimates/estimates/${estimate.id}`)}
                    className="hover:bg-muted cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="font-medium text-foreground">{estimate.number}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-foreground">{estimate.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground">{estimate.object_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground">{estimate.legal_entity_name}</span>
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
                        <span className="text-sm text-muted-foreground">✗ Нет</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {estimate.approved_by_customer ? (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                          ✓ Да
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground">
                          ✗ Нет
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground">v{estimate.version_number}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Нет смет</p>
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
                  onChange={(e) => setFormData({ ...formData, object: Number(e.target.value), projects: [] })}
                  className="mt-1.5 w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  <option value={0}>Выберите объект</option>
                  {objects.map((obj) => (
                    <option key={obj.id} value={obj.id}>{obj.name}</option>
                  ))}
                </select>
                {objectsError && (
                  <p className="text-xs text-red-500 mt-1">Ошибка загрузки объектов</p>
                )}
              </div>

              <div>
                <Label htmlFor="legal_entity">Наша компания *</Label>
                <select
                  id="legal_entity"
                  value={formData.legal_entity}
                  onChange={(e) => handleLegalEntityChange(Number(e.target.value))}
                  className="mt-1.5 w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
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

            <div>
              <Label>Проекты-основания (опционально)</Label>
              {formData.object === 0 ? (
                <p className="mt-1.5 text-sm text-muted-foreground">Сначала выберите объект</p>
              ) : !projects?.length ? (
                <p className="mt-1.5 text-sm text-muted-foreground">Нет проектов для этого объекта</p>
              ) : (
                <div className="mt-1.5 space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-2">
                  {projects.map((p) => {
                    const isChecked = formData.projects.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className={`flex flex-col gap-1 p-2 rounded-lg cursor-pointer transition-colors ${
                          isChecked ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setFormData(prev => ({
                                ...prev,
                                projects: isChecked
                                  ? prev.projects.filter(id => id !== p.id)
                                  : [...prev.projects, p.id],
                              }));
                            }}
                            className="rounded border-border"
                          />
                          <span className="text-sm font-medium">{p.cipher} — {p.name}</span>
                        </div>
                        {p.project_files && p.project_files.length > 0 && (
                          <div className="ml-6 space-y-0.5">
                            {p.project_files.map((pf) => (
                              <div key={pf.id} className="text-xs text-muted-foreground flex items-center gap-1.5">
                                <Badge variant="outline" className="text-[10px] px-1 py-0">{pf.file_type_name}</Badge>
                                <span className="truncate">{pf.title || pf.original_filename}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
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