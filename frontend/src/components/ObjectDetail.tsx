import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ConstructionObject, ObjectCashFlowData } from '../lib/api';
import { formatDate, formatAmount, formatCurrency, getStatusBadgeClass, getStatusLabel } from '../lib/utils';
import { CONSTANTS } from '../constants';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Building2, Loader2, ArrowLeft, Pencil, Trash2, Calendar, MapPin, FileText, FileSpreadsheet, Briefcase, DollarSign, TrendingUp } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';

export function ObjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const objectId = parseInt(id || '0');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    address: '',
    status: '',
    start_date: '',
    end_date: '',
    description: '',
  });

  const { data: object, isLoading, error } = useQuery({
    queryKey: ['construction-object', objectId],
    queryFn: () => api.getConstructionObjectById(objectId),
    enabled: !!objectId,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Заполняем форму при открытии диалога
  const handleOpenEditDialog = () => {
    if (object) {
      setEditFormData({
        name: object.name || '',
        address: object.address || '',
        status: object.status || '',
        start_date: object.start_date ? new Date(object.start_date).toISOString().split('T')[0] : '',
        end_date: object.end_date ? new Date(object.end_date).toISOString().split('T')[0] : '',
        description: object.description || '',
      });
    }
    setIsEditDialogOpen(true);
  };

  // Мутация для редактирования
  const updateMutation = useMutation({
    mutationFn: (data: any) => api.updateConstructionObject(objectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-object', objectId] });
      queryClient.invalidateQueries({ queryKey: ['construction-objects'] });
      toast.success('Объект успешно обновлен');
      setIsEditDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Ошибка при обновлении объекта');
    },
  });

  // Мутация для удаления
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteConstructionObject(objectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-objects'] });
      toast.success('Объект успешно удален');
      navigate('/objects');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Ошибка при удалении объекта');
    },
  });

  const handleSubmitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(editFormData);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !object) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-600 p-4 rounded-xl">
          Ошибка загрузки объекта: {(error as Error)?.message || 'Объект не найден'}
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    return (
      <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusBadgeClass(status)}`}>
        {getStatusLabel(status)}
      </span>
    );
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Кнопка назад */}
        <Button
          variant="ghost"
          onClick={() => navigate('/objects')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад к списку
        </Button>

        {/* Шапка */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <Building2 className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold text-gray-900 mb-2">{object.name}</h1>
                <div className="flex items-center gap-2 text-gray-600 mb-2">
                  <MapPin className="w-4 h-4" />
                  <span>{object.address}</span>
                </div>
                <div>{getStatusBadge(object.status)}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleOpenEditDialog}>
                <Pencil className="w-4 h-4 mr-2" />
                Редактировать
              </Button>
              <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => setIsDeleteDialogOpen(true)}>
                <Trash2 className="w-4 h-4 mr-2" />
                Удалить
              </Button>
            </div>
          </div>

          {/* Панель информации */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
            {object.start_date && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Дата начала</div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium">{formatDate(object.start_date)}</span>
                </div>
              </div>
            )}
            {object.end_date && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Дата окончания</div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium">{formatDate(object.end_date)}</span>
                </div>
              </div>
            )}
            {object.contracts_count !== undefined && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Договоров</div>
                <div className="text-sm font-medium">{object.contracts_count}</div>
              </div>
            )}
          </div>

          {object.description && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Описание</div>
              <p className="text-sm text-gray-700">{object.description}</p>
            </div>
          )}
        </div>

        {/* Вкладки */}
        <Tabs defaultValue="main" className="w-full">
          <TabsList className="grid w-full grid-cols-7 mb-6">
            <TabsTrigger value="main">Основное</TabsTrigger>
            <TabsTrigger value="contracts">Договоры</TabsTrigger>
            <TabsTrigger value="projects">Проекты</TabsTrigger>
            <TabsTrigger value="estimates">Сметы</TabsTrigger>
            <TabsTrigger value="tkp">ТКП</TabsTrigger>
            <TabsTrigger value="mp">МП</TabsTrigger>
            <TabsTrigger value="cashflow">Cash-flow</TabsTrigger>
          </TabsList>

          <TabsContent value="main">
            <MainTab object={object} />
          </TabsContent>

          <TabsContent value="contracts">
            <ContractsTab objectId={objectId} />
          </TabsContent>

          <TabsContent value="projects">
            <ProjectsTab objectId={objectId} />
          </TabsContent>

          <TabsContent value="estimates">
            <EstimatesTab objectId={objectId} />
          </TabsContent>

          <TabsContent value="tkp">
            <TKPTab objectId={objectId} />
          </TabsContent>

          <TabsContent value="mp">
            <MPTab objectId={objectId} />
          </TabsContent>

          <TabsContent value="cashflow">
            <CashFlowTab objectId={objectId} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Диалог редактирования */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Редактирование объекта</DialogTitle>
            <DialogDescription>Обновите информацию об объекте.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitEdit} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name">Название</Label>
              <Input id="name" value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="address">Адрес</Label>
              <Input id="address" value={editFormData.address} onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status">Статус</Label>
              <Select value={editFormData.status} onValueChange={(value) => setEditFormData({ ...editFormData, status: value })}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Выберите статус">{editFormData.status}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Планируется</SelectItem>
                  <SelectItem value="active">В работе</SelectItem>
                  <SelectItem value="completed">Завершён</SelectItem>
                  <SelectItem value="suspended">Приостановлен</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="start_date">Дата начала</Label>
              <Input
                id="start_date"
                type="date"
                value={editFormData.start_date}
                onChange={(e) => setEditFormData({ ...editFormData, start_date: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="end_date">Дата окончания</Label>
              <Input
                id="end_date"
                type="date"
                value={editFormData.end_date}
                onChange={(e) => setEditFormData({ ...editFormData, end_date: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="flex justify-end gap-4 mt-4">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Сохранение...</> : 'Сохранить'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Диалог удаления */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Удаление объекта</DialogTitle>
            <DialogDescription>Вы уверены, что хотите удалить этот объект?</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={deleteMutation.isPending}>
              Отмена
            </Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Удаление...</> : 'Удалить'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MainTab({ object }: { object: ConstructionObject }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-xl font-semibold mb-4">Информация об объекте</h2>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="text-sm text-gray-500 mb-1">ID</div>
          <div className="font-medium">{object.id}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500 mb-1">Название</div>
          <div className="font-medium">{object.name}</div>
        </div>
        <div className="col-span-2">
          <div className="text-sm text-gray-500 mb-1">Адрес</div>
          <div className="font-medium">{object.address}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500 mb-1">Статус</div>
          <div className="font-medium">{object.status}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500 mb-1">Количество договоров</div>
          <div className="font-medium">{object.contracts_count || 0}</div>
        </div>
        {object.start_date && (
          <div>
            <div className="text-sm text-gray-500 mb-1">Дата начала</div>
            <div className="font-medium">{formatDate(object.start_date)}</div>
          </div>
        )}
        {object.end_date && (
          <div>
            <div className="text-sm text-gray-500 mb-1">Дата окончания</div>
            <div className="font-medium">{formatDate(object.end_date)}</div>
          </div>
        )}
        {object.description && (
          <div className="col-span-2">
            <div className="text-sm text-gray-500 mb-1">Описание</div>
            <div className="font-medium">{object.description}</div>
          </div>
        )}
        {object.created_at && (
          <div>
            <div className="text-sm text-gray-500 mb-1">Создан</div>
            <div className="font-medium">{formatDate(object.created_at)}</div>
          </div>
        )}
        {object.updated_at && (
          <div>
            <div className="text-sm text-gray-500 mb-1">Обновлён</div>
            <div className="font-medium">{formatDate(object.updated_at)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ContractsTab({ objectId }: { objectId: number }) {
  const navigate = useNavigate();
  const { data: contracts, isLoading } = useQuery({
    queryKey: ['contracts', { object: objectId }],
    queryFn: () => api.getContracts({ object: objectId }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  }

  const contractsList = contracts?.results || [];

  if (!contractsList || contractsList.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <Briefcase className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">Нет договоров для этого объекта</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Номер</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Название</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Контрагент</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Сумма</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {contractsList.map((contract: any) => (
              <tr
                key={contract.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/contracts/${contract.id}`)}
              >
                <td className="px-6 py-4 text-sm font-mono">{contract.number}</td>
                <td className="px-6 py-4 text-sm">{contract.name || '—'}</td>
                <td className="px-6 py-4 text-sm">{formatDate(contract.date)}</td>
                <td className="px-6 py-4 text-sm">{contract.counterparty_name || '—'}</td>
                <td className="px-6 py-4 text-sm text-right">{formatCurrency(contract.amount)}</td>
                <td className="px-6 py-4 text-sm">{contract.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProjectsTab({ objectId }: { objectId: number }) {
  const navigate = useNavigate();
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', { object: objectId }],
    queryFn: () => api.getProjects({ object: objectId }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">Нет проектов для этого объекта</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Шифр</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Название</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Стадия</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус проверки</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {projects.map((project: any) => (
              <tr
                key={project.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/estimates/projects/${project.id}`)}
              >
                <td className="px-6 py-4 text-sm font-mono">{project.cipher}</td>
                <td className="px-6 py-4 text-sm">{project.name}</td>
                <td className="px-6 py-4 text-sm">{project.stage || '—'}</td>
                <td className="px-6 py-4 text-sm">{formatDate(project.date)}</td>
                <td className="px-6 py-4 text-sm">{project.verification_status || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EstimatesTab({ objectId }: { objectId: number }) {
  const navigate = useNavigate();
  const { data: estimates, isLoading } = useQuery({
    queryKey: ['estimates', { object: objectId }],
    queryFn: () => api.getEstimates({ object: objectId }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  }

  if (!estimates || estimates.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">Нет смет для этого объекта</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Номер</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Название</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Компания</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Сумма</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {estimates.map((estimate: any) => (
              <tr
                key={estimate.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/estimates/${estimate.id}`)}
              >
                <td className="px-6 py-4 text-sm font-mono">{estimate.number}</td>
                <td className="px-6 py-4 text-sm">{estimate.name}</td>
                <td className="px-6 py-4 text-sm">{estimate.company_name || '—'}</td>
                <td className="px-6 py-4 text-sm">{estimate.status}</td>
                <td className="px-6 py-4 text-sm text-right">{formatCurrency(estimate.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TKPTab({ objectId }: { objectId: number }) {
  const navigate = useNavigate();
  const { data: tkpsData, isLoading } = useQuery({
    queryKey: ['technical-proposals', { object: objectId }],
    queryFn: () => api.getTechnicalProposals({ object: objectId }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });
  const tkps = tkpsData?.results;

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  }

  if (!tkps || tkps.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">Нет ТКП для этого объекта</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Номер</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Название</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Компания</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Сумма</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {tkps.map((tkp: any) => (
              <tr
                key={tkp.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/proposals/tkp/${tkp.id}`)}
              >
                <td className="px-6 py-4 text-sm font-mono">{tkp.number}</td>
                <td className="px-6 py-4 text-sm">{tkp.description || '—'}</td>
                <td className="px-6 py-4 text-sm">{formatDate(tkp.date)}</td>
                <td className="px-6 py-4 text-sm">{tkp.counterparty_name || '—'}</td>
                <td className="px-6 py-4 text-sm">{tkp.status}</td>
                <td className="px-6 py-4 text-sm text-right">{formatCurrency(tkp.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MPTab({ objectId }: { objectId: number }) {
  const navigate = useNavigate();
  const { data: mpsData, isLoading } = useQuery({
    queryKey: ['mounting-proposals', { object: objectId }],
    queryFn: () => api.getMountingProposals({ object: objectId.toString() }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });
  const mps = mpsData?.results;

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  }

  if (!mps || mps.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">Нет МП для этого объекта</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Номер</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Название</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Исполнитель</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Сумма</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {mps.map((mp: any) => (
              <tr
                key={mp.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/proposals/mp/${mp.id}`)}
              >
                <td className="px-6 py-4 text-sm font-mono">{mp.number}</td>
                <td className="px-6 py-4 text-sm">{mp.description || '—'}</td>
                <td className="px-6 py-4 text-sm">{formatDate(mp.date)}</td>
                <td className="px-6 py-4 text-sm">{mp.counterparty_name || '—'}</td>
                <td className="px-6 py-4 text-sm">{mp.status}</td>
                <td className="px-6 py-4 text-sm text-right">{formatCurrency(mp.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CashFlowTab({ objectId }: { objectId: number }) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');

  const { data: cashFlow, isLoading } = useQuery({
    queryKey: ['object-cashflow', objectId, startDate, endDate],
    queryFn: () => api.getObjectCashFlow(objectId, { 
      start_date: startDate || undefined, 
      end_date: endDate || undefined 
    }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Безопасное преобразование данных в массив
  const cashFlowData = Array.isArray(cashFlow) ? cashFlow : [];

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Денежный поток</h2>
        <div className="flex gap-2">
          <Button
            variant={chartType === 'line' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setChartType('line')}
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            График
          </Button>
          <Button
            variant={chartType === 'bar' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setChartType('bar')}
          >
            <DollarSign className="w-4 h-4 mr-2" />
            Столбцы
          </Button>
        </div>
      </div>

      {/* Фильтры */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <Label htmlFor="start_date">Дата начала</Label>
          <Input
            id="start_date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="end_date">Дата окончания</Label>
          <Input
            id="end_date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1.5"
          />
        </div>
      </div>

      {/* График */}
      {cashFlowData.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p>Нет данных о денежном потоке</p>
        </div>
      ) : (
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'line' ? (
              <LineChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="income" stroke="#10b981" name="Приход" strokeWidth={2} />
                <Line type="monotone" dataKey="expense" stroke="#ef4444" name="Расход" strokeWidth={2} />
                <Line type="monotone" dataKey="net" stroke="#3b82f6" name="Чистый поток" strokeWidth={2} />
              </LineChart>
            ) : (
              <BarChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="income" fill="#10b981" name="Приход" />
                <Bar dataKey="expense" fill="#ef4444" name="Расход" />
                <Bar dataKey="net" fill="#3b82f6" name="Чистый поток" />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}