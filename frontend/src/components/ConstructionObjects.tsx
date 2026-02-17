import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ConstructionObject, CreateConstructionObjectData } from '../lib/api';
import { CONSTANTS } from '../constants';
import { formatDate } from '../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Building2, Loader2, Plus, Search, Calendar, MapPin, LayoutGrid, Table as TableIcon } from 'lucide-react';
import { toast } from 'sonner';

type ViewMode = 'table' | 'grid';

type ConstructionObjectsProps = {
  defaultStatusFilter?: string;
  defaultCreateStatus?: string;
  pageTitle?: string;
};

export function ConstructionObjects({ defaultStatusFilter, defaultCreateStatus, pageTitle }: ConstructionObjectsProps = {}) {
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>(defaultStatusFilter || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (defaultStatusFilter !== undefined) setStatusFilter(defaultStatusFilter);
  }, [defaultStatusFilter]);

  const { data: objectsData, isLoading, error } = useQuery({
    queryKey: ['construction-objects', statusFilter, searchQuery],
    queryFn: () => api.getConstructionObjects({ 
      status: statusFilter || undefined, 
      search: searchQuery || undefined 
    }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const objects = (objectsData as any)?.results || objectsData || [];

  const createMutation = useMutation({
    mutationFn: (data: CreateConstructionObjectData) => api.createConstructionObject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-objects'] });
      setIsDialogOpen(false);
      toast.success('Объект успешно создан');
    },
    onError: (error: any) => {
      if (error.message && error.message.includes('already exists')) {
        toast.error('Объект с таким названием уже существует');
      } else {
        toast.error(`Ошибка: ${error.message || 'Неизвестная ошибка'}`);
      }
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'planned':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">Планируется</span>;
      case 'in_progress':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">В работе</span>;
      case 'completed':
        return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">Завершён</span>;
      case 'suspended':
        return <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded">Приостановлен</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">{status}</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-xl">
        Ошибка загрузки: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold">{pageTitle || 'Объекты строительства'}</h1>
            <p className="text-gray-500 mt-1">
              {objects?.length || 0} {objects?.length === 1 ? 'объект' : 'объектов'}
            </p>
          </div>
          <Button onClick={() => setIsDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Новый объект
          </Button>
        </div>

        {/* Фильтры и переключатель вида */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[250px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Поиск по названию или адресу..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  aria-label="Поиск объектов"
                />
              </div>
            </div>

            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-auto">
              <TabsList>
                <TabsTrigger value="">Все</TabsTrigger>
                <TabsTrigger value="planned">Планируются</TabsTrigger>
                <TabsTrigger value="in_progress">В работе</TabsTrigger>
                <TabsTrigger value="completed">Завершённые</TabsTrigger>
                <TabsTrigger value="suspended">Приостановлены</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Переключатель вида */}
            <div className="flex items-center border rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 transition-colors ${viewMode === 'table' ? 'bg-blue-100 text-blue-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                aria-label="Табличный вид"
                tabIndex={0}
              >
                <TableIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-blue-100 text-blue-700' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                aria-label="Вид мозаикой"
                tabIndex={0}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Create Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Новый объект</DialogTitle>
              <DialogDescription>Введите информацию об объекте строительства</DialogDescription>
            </DialogHeader>
            <ConstructionObjectForm 
              onSubmit={(data) => createMutation.mutate(data)}
              isLoading={createMutation.isPending}
              defaultStatus={defaultCreateStatus}
            />
          </DialogContent>
        </Dialog>

        {/* Content */}
        {!objects || objects.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
            <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">Нет объектов</p>
            <Button onClick={() => setIsDialogOpen(true)} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Добавить первый объект
            </Button>
          </div>
        ) : viewMode === 'table' ? (
          <ObjectsTable objects={objects} getStatusBadge={getStatusBadge} onRowClick={(id) => navigate(`/objects/${id}`)} />
        ) : (
          <ObjectsGrid objects={objects} getStatusBadge={getStatusBadge} onCardClick={(id) => navigate(`/objects/${id}`)} />
        )}
      </div>
    </div>
  );
}

/* ===== TABLE VIEW ===== */

type ObjectsTableProps = {
  objects: ConstructionObject[];
  getStatusBadge: (status: string) => React.ReactElement;
  onRowClick: (id: number) => void;
};

const ObjectsTable = ({ objects, getStatusBadge, onRowClick }: ObjectsTableProps) => {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left py-3 px-4 font-medium text-gray-600 w-10"></th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Название</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Адрес</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Статус</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Начало</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">Окончание</th>
            <th className="text-right py-3 px-4 font-medium text-gray-600">Договоров</th>
          </tr>
        </thead>
        <tbody>
          {objects.map((object: ConstructionObject) => (
            <tr
              key={object.id}
              onClick={() => onRowClick(object.id)}
              className="border-b border-gray-100 last:border-0 hover:bg-blue-50/50 cursor-pointer transition-colors"
              tabIndex={0}
              role="button"
              aria-label={`Открыть объект ${object.name}`}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(object.id); } }}
            >
              <td className="py-3 px-4">
                {object.photo ? (
                  <img src={object.photo} alt={object.name} className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-blue-600" />
                  </div>
                )}
              </td>
              <td className="py-3 px-4 font-medium text-gray-900">{object.name}</td>
              <td className="py-3 px-4 text-gray-600 max-w-[250px] truncate">{object.address}</td>
              <td className="py-3 px-4">{getStatusBadge(object.status)}</td>
              <td className="py-3 px-4 text-gray-500">{object.start_date ? formatDate(object.start_date) : '—'}</td>
              <td className="py-3 px-4 text-gray-500">{object.end_date ? formatDate(object.end_date) : '—'}</td>
              <td className="py-3 px-4 text-right text-gray-600">{object.contracts_count ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ===== GRID VIEW ===== */

type ObjectsGridProps = {
  objects: ConstructionObject[];
  getStatusBadge: (status: string) => React.ReactElement;
  onCardClick: (id: number) => void;
};

const ObjectsGrid = ({ objects, getStatusBadge, onCardClick }: ObjectsGridProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {objects.map((object: ConstructionObject) => (
        <div
          key={object.id}
          className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer"
          onClick={() => onCardClick(object.id)}
          tabIndex={0}
          role="button"
          aria-label={`Открыть объект ${object.name}`}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(object.id); } }}
        >
          {/* Фото/Иконка объекта */}
          {object.photo ? (
            <img src={object.photo} alt={object.name} className="w-12 h-12 rounded-full object-cover mb-4" />
          ) : (
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
          )}

          <h3 className="text-lg font-semibold text-gray-900 mb-2">{object.name}</h3>

          <div className="flex items-start gap-2 text-sm text-gray-600 mb-3">
            <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{object.address}</span>
          </div>

          <div className="mb-3">
            {getStatusBadge(object.status)}
          </div>

          <div className="space-y-1 text-sm text-gray-500">
            {object.start_date && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Начало: {formatDate(object.start_date)}</span>
              </div>
            )}
            {object.end_date && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Окончание: {formatDate(object.end_date)}</span>
              </div>
            )}
          </div>

          {object.contracts_count !== undefined && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">
                Договоров: <span className="font-semibold text-gray-700">{object.contracts_count}</span>
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

/* ===== CREATE/EDIT FORM ===== */

interface ConstructionObjectFormProps {
  object?: ConstructionObject;
  onSubmit: (data: CreateConstructionObjectData) => void;
  isLoading: boolean;
  defaultStatus?: string;
}

function ConstructionObjectForm({ object, onSubmit, isLoading, defaultStatus }: ConstructionObjectFormProps) {
  const [formData, setFormData] = useState({
    name: object?.name || '',
    address: object?.address || '',
    status: object?.status || defaultStatus || 'planned',
    start_date: object?.start_date || '',
    end_date: object?.end_date || '',
    description: object?.description || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.address.trim()) {
      toast.error('Заполните обязательные поля');
      return;
    }

    const dataToSubmit: CreateConstructionObjectData = {
      name: formData.name,
      address: formData.address,
      status: formData.status as 'planned' | 'in_progress' | 'completed' | 'suspended',
    };

    if (formData.start_date) dataToSubmit.start_date = formData.start_date;
    if (formData.end_date) dataToSubmit.end_date = formData.end_date;
    if (formData.description?.trim()) dataToSubmit.description = formData.description;

    onSubmit(dataToSubmit);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="name">
            Название <span className="text-red-500">*</span>
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Жилой комплекс Премиум"
            disabled={isLoading}
            className="mt-1.5"
            required
          />
        </div>

        <div className="col-span-2">
          <Label htmlFor="address">
            Адрес <span className="text-red-500">*</span>
          </Label>
          <Input
            id="address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            placeholder="г. Москва, ул. Ленина, д. 1"
            disabled={isLoading}
            className="mt-1.5"
            required
          />
        </div>

        <div className="col-span-2">
          <Label htmlFor="status">
            Статус <span className="text-red-500">*</span>
          </Label>
          <Select
            value={formData.status}
            onValueChange={(value: any) => setFormData({ ...formData, status: value })}
            disabled={isLoading}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="planned">Планируется</SelectItem>
              <SelectItem value="in_progress">В работе</SelectItem>
              <SelectItem value="completed">Завершён</SelectItem>
              <SelectItem value="suspended">Приостановлен</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="start_date">Дата начала</Label>
          <Input
            id="start_date"
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="end_date">Дата окончания</Label>
          <Input
            id="end_date"
            type="date"
            value={formData.end_date}
            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>

        <div className="col-span-2">
          <Label htmlFor="description">Описание</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Дополнительная информация об объекте"
            disabled={isLoading}
            className="mt-1.5"
            rows={3}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {object ? 'Сохранение...' : 'Создание...'}
            </>
          ) : (
            object ? 'Сохранить' : 'Создать'
          )}
        </Button>
      </div>
    </form>
  );
}
