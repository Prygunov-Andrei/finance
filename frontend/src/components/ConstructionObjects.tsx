import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ConstructionObject, CreateConstructionObjectData } from '../lib/api';
import { CONSTANTS } from '../constants';
import { formatDate } from '../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Building2, Loader2, Plus, Search, Calendar, MapPin, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

type ConstructionObjectsProps = {
  defaultStatusFilter?: string;
  defaultCreateStatus?: string;
  pageTitle?: string;
};

export function ConstructionObjects({ defaultStatusFilter, defaultCreateStatus, pageTitle }: ConstructionObjectsProps = {}) {
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingObject, setEditingObject] = useState<ConstructionObject | null>(null);
  const [deletingObject, setDeletingObject] = useState<ConstructionObject | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(defaultStatusFilter || '');
  const [searchQuery, setSearchQuery] = useState('');
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

  // Извлекаем массив из ответа API
  const objects = objectsData?.results || objectsData || [];

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

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateConstructionObjectData> }) => 
      api.updateConstructionObject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-objects'] });
      setEditingObject(null);
      toast.success('Объект успешно обновлен');
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteConstructionObject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-objects'] });
      setDeletingObject(null);
      toast.success('Объект успешно удален');
    },
    onError: (error: any) => {
      if (error.message.includes('Cannot delete') || error.message.includes('связанные')) {
        toast.error('Нельзя удалить объект, по которому есть операции');
      } else {
        toast.error(`Ошибка: ${error.message}`);
      }
      setDeletingObject(null);
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'planned':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">Планируется</span>;
      case 'active':
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

        {/* Фильтры */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-wrap gap-4">
            {/* Поиск */}
            <div className="flex-1 min-w-[250px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Поиск по названию или адресу..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Фильтр по статусу */}
            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-auto">
              <TabsList>
                <TabsTrigger value="">Все</TabsTrigger>
                <TabsTrigger value="planned">Планируются</TabsTrigger>
                <TabsTrigger value="active">В работе</TabsTrigger>
                <TabsTrigger value="completed">Завершённые</TabsTrigger>
                <TabsTrigger value="suspended">Приостановлены</TabsTrigger>
              </TabsList>
            </Tabs>
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

        {/* Edit Dialog */}
        <Dialog open={!!editingObject} onOpenChange={(open) => !open && setEditingObject(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Редактировать объект</DialogTitle>
              <DialogDescription>Измените информацию об объекте строительства</DialogDescription>
            </DialogHeader>
            {editingObject && (
              <ConstructionObjectForm 
                object={editingObject}
                onSubmit={(data) => updateMutation.mutate({ id: editingObject.id, data })}
                isLoading={updateMutation.isPending}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Delete AlertDialog */}
        <AlertDialog open={!!deletingObject} onOpenChange={(open) => !open && setDeletingObject(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
              <AlertDialogDescription>
                Это действие нельзя отменить. Объект "{deletingObject?.name}" будет удален навсегда.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingObject && deleteMutation.mutate(deletingObject.id)}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Grid карточек */}
        {!objects || objects.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
            <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">Нет объектов</p>
            <Button onClick={() => setIsDialogOpen(true)} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Добавить первый объект
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {objects.map((object: ConstructionObject) => (
              <div
                key={object.id}
                className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer group relative"
                onClick={() => navigate(`/objects/${object.id}`)}
              >
                {/* Dropdown в углу */}
                <div className="absolute top-4 right-4" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        setEditingObject(object);
                      }}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Редактировать
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingObject(object);
                        }}
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Иконка объекта */}
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <Building2 className="w-6 h-6 text-blue-600" />
                </div>

                {/* Название */}
                <h3 className="text-lg font-semibold text-gray-900 mb-2 pr-8">{object.name}</h3>

                {/* Адрес */}
                <div className="flex items-start gap-2 text-sm text-gray-600 mb-3">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{object.address}</span>
                </div>

                {/* Статус */}
                <div className="mb-3">
                  {getStatusBadge(object.status)}
                </div>

                {/* Даты */}
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

                {/* Количество договоров */}
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
        )}
      </div>
    </div>
  );
}

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
      status: formData.status as 'planned' | 'active' | 'completed' | 'suspended',
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
              <SelectItem value="active">В работе</SelectItem>
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