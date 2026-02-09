import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ConstructionObject, ObjectCashFlowData, WorklogShift, WorklogTeam, WorklogMedia, WorklogReport, WorklogReportDetail, WorklogQuestion, WorklogAnswer, WorklogSupergroup, WorkJournalSummary, PaginatedResponse, InviteToken, Counterparty } from '../lib/api';
import { formatDate, formatDateTime, formatAmount, formatCurrency, getStatusBadgeClass, getStatusLabel, cn } from '../lib/utils';
import { CONSTANTS } from '../constants';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Building2, Loader2, ArrowLeft, Pencil, Trash2, Calendar, MapPin, FileText, FileSpreadsheet, Briefcase, DollarSign, TrendingUp, ClipboardList, Users, Image, Clock, Camera, Video, Mic, FileQuestion, ChevronLeft, ChevronRight, Filter, Eye, MessageCircle, Send, Globe, Save, Link2, CheckCircle2, XCircle, Settings, UserPlus, Copy, ExternalLink, Plus, QrCode } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { Badge } from './ui/badge';
import { QRCodeSVG } from 'qrcode.react';

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
          <TabsList className="flex w-full flex-wrap mb-6">
            <TabsTrigger value="main">Основное</TabsTrigger>
            <TabsTrigger value="contracts">Договоры</TabsTrigger>
            <TabsTrigger value="projects">Проекты</TabsTrigger>
            <TabsTrigger value="estimates">Сметы</TabsTrigger>
            <TabsTrigger value="tkp">ТКП</TabsTrigger>
            <TabsTrigger value="mp">МП</TabsTrigger>
            <TabsTrigger value="cashflow">Cash-flow</TabsTrigger>
            <TabsTrigger value="work-journal">Журнал работ</TabsTrigger>
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

          <TabsContent value="work-journal">
            <WorkJournalTab objectId={objectId} />
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

// =============================================================================
// Журнал работ — полноценная вкладка
// =============================================================================

const SHIFT_TYPE_LABELS: Record<string, string> = {
  day: 'Дневная',
  evening: 'Вечерняя',
  night: 'Ночная',
};

const SHIFT_STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  scheduled: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-600',
};

const MEDIA_TYPE_ICONS: Record<string, typeof Camera> = {
  photo: Camera,
  video: Video,
  voice: Mic,
  audio: Mic,
  text: FileText,
  document: FileSpreadsheet,
};

const MEDIA_TAG_STYLES: Record<string, string> = {
  progress: 'bg-blue-100 text-blue-700',
  problem: 'bg-red-100 text-red-700',
  safety: 'bg-yellow-100 text-yellow-700',
  result: 'bg-green-100 text-green-700',
  other: 'bg-gray-100 text-gray-600',
};

type JournalSection = 'overview' | 'shifts' | 'media' | 'reports' | 'settings';

function WorkJournalTab({ objectId }: { objectId: number }) {
  const [activeSection, setActiveSection] = useState<JournalSection>('overview');
  const [shiftsPage, setShiftsPage] = useState(1);
  const [mediaPage, setMediaPage] = useState(1);
  const [reportsPage, setReportsPage] = useState(1);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string>('');
  const [mediaTagFilter, setMediaTagFilter] = useState<string>('');
  const [shiftStatusFilter, setShiftStatusFilter] = useState<string>('');
  const [reportTypeFilter, setReportTypeFilter] = useState<string>('');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['work-journal-summary', objectId],
    queryFn: () => api.getWorkJournalSummary(objectId),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: shifts, isLoading: shiftsLoading } = useQuery({
    queryKey: ['worklog-shifts', objectId, shiftsPage, shiftStatusFilter],
    queryFn: () => api.getWorklogShifts({
      object: objectId,
      page: shiftsPage,
      page_size: 10,
      ...(shiftStatusFilter ? { status: shiftStatusFilter } : {}),
    }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
    enabled: activeSection === 'shifts' || activeSection === 'overview',
  });

  const { data: media, isLoading: mediaLoading } = useQuery({
    queryKey: ['worklog-media', objectId, mediaPage, mediaTypeFilter, mediaTagFilter],
    queryFn: () => api.getWorklogMedia({
      page: mediaPage,
      page_size: 12,
      ...(mediaTypeFilter ? { media_type: mediaTypeFilter } : {}),
      ...(mediaTagFilter ? { tag: mediaTagFilter } : {}),
    }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
    enabled: activeSection === 'media',
  });

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ['worklog-reports', objectId, reportsPage, reportTypeFilter],
    queryFn: () => api.getWorklogReports({
      page: reportsPage,
      page_size: 10,
      ...(reportTypeFilter ? { report_type: reportTypeFilter } : {}),
    }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
    enabled: activeSection === 'reports',
  });

  if (summaryLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  const isEmpty = !summary || (summary.total_shifts === 0 && summary.total_media === 0);

  const sectionButtons: { key: JournalSection; label: string; icon: typeof Clock }[] = [
    { key: 'overview', label: 'Обзор', icon: ClipboardList },
    { key: 'shifts', label: 'Смены', icon: Clock },
    { key: 'media', label: 'Медиа', icon: Image },
    { key: 'reports', label: 'Отчёты', icon: FileText },
    { key: 'settings', label: 'Настройки', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      {/* Summary cards — только если есть данные */}
      {!isEmpty && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <SummaryCard
            icon={Clock}
            label="Смены"
            value={summary!.total_shifts}
            extra={summary!.active_shifts > 0 ? `${summary!.active_shifts} активных` : undefined}
            extraColor="text-green-600"
          />
          <SummaryCard icon={Users} label="Звенья" value={summary!.total_teams} />
          <SummaryCard icon={Image} label="Медиа" value={summary!.total_media} />
          <SummaryCard icon={FileText} label="Отчёты" value={summary!.total_reports} />
          <SummaryCard icon={Users} label="Монтажники" value={summary!.total_workers} />
        </div>
      )}

      {/* Section navigation */}
      <div className="flex gap-2 border-b border-gray-200 pb-0">
        {sectionButtons.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeSection === key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
            onClick={() => setActiveSection(key)}
            tabIndex={0}
            aria-label={`Раздел ${label}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Section content */}
      {activeSection === 'overview' && (
        isEmpty ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Журнал работ</h3>
            <p className="text-gray-500 max-w-md mx-auto mb-6">
              Здесь будут отображаться смены, звенья, медиа и отчёты монтажников.
              Для начала работы пригласите монтажников и откройте первую смену.
            </p>
            <Button
              onClick={() => setActiveSection('settings')}
              aria-label="Перейти к настройкам"
              tabIndex={0}
            >
              <UserPlus className="w-4 h-4 mr-2" /> Пригласить монтажника
            </Button>
          </div>
        ) : (
          <OverviewSection shifts={summary!.recent_shifts} />
        )
      )}

      {activeSection === 'shifts' && (
        <ShiftsSection
          objectId={objectId}
          data={shifts}
          isLoading={shiftsLoading}
          page={shiftsPage}
          onPageChange={setShiftsPage}
          statusFilter={shiftStatusFilter}
          onStatusFilterChange={setShiftStatusFilter}
        />
      )}

      {activeSection === 'media' && (
        <MediaSection
          data={media}
          isLoading={mediaLoading}
          page={mediaPage}
          onPageChange={setMediaPage}
          typeFilter={mediaTypeFilter}
          onTypeFilterChange={setMediaTypeFilter}
          tagFilter={mediaTagFilter}
          onTagFilterChange={setMediaTagFilter}
        />
      )}

      {activeSection === 'reports' && (
        <ReportsSection
          data={reports}
          isLoading={reportsLoading}
          page={reportsPage}
          onPageChange={setReportsPage}
          typeFilter={reportTypeFilter}
          onTypeFilterChange={setReportTypeFilter}
          onReportClick={(id) => { setSelectedReportId(id); setReportDialogOpen(true); }}
        />
      )}

      {activeSection === 'settings' && (
        <div className="space-y-6">
          <InviteSection objectId={objectId} />
          <GeoSettingsSection objectId={objectId} />
          <SupergroupSection objectId={objectId} />
        </div>
      )}

      {/* Диалог деталей отчёта */}
      <ReportDetailDialog
        reportId={selectedReportId}
        open={reportDialogOpen}
        onOpenChange={setReportDialogOpen}
      />
    </div>
  );
}

// --------------- Summary Card ---------------

function SummaryCard({
  icon: Icon,
  label,
  value,
  extra,
  extraColor = 'text-gray-500',
}: {
  icon: typeof Clock;
  label: string;
  value: number;
  extra?: string;
  extraColor?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-50 rounded-lg">
          <Icon className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
          <div className="text-sm text-gray-500">{label}</div>
          {extra && <div className={cn('text-xs mt-0.5', extraColor)}>{extra}</div>}
        </div>
      </div>
    </div>
  );
}

// --------------- Overview Section ---------------

function OverviewSection({ shifts }: { shifts: WorklogShift[] }) {
  if (!shifts || shifts.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Нет недавних смен</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-900">Последние смены</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Тип</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Время</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Контрагент</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Регистрации</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Звенья</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {shifts.map((shift) => (
              <ShiftRow key={shift.id} shift={shift} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --------------- Shift Row ---------------

function ShiftRow({ shift, onActivate, onClose }: {
  shift: WorklogShift;
  onActivate?: (id: string) => void;
  onClose?: (id: string) => void;
}) {
  const [qrOpen, setQrOpen] = useState(false);

  const qrValue = JSON.stringify({ shift_id: shift.id, token: shift.qr_token });

  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatDate(shift.date)}</td>
        <td className="px-6 py-4 text-sm text-gray-700">{SHIFT_TYPE_LABELS[shift.shift_type] || shift.shift_type}</td>
        <td className="px-6 py-4 text-sm text-gray-500 font-mono">{shift.start_time?.slice(0, 5)} — {shift.end_time?.slice(0, 5)}</td>
        <td className="px-6 py-4 text-sm text-gray-700">{shift.contract_number ? `${shift.contract_number}` : '—'}</td>
        <td className="px-6 py-4 text-sm text-gray-700">{shift.contractor_name || '—'}</td>
        <td className="px-6 py-4 text-sm text-center text-gray-700">{shift.registrations_count}</td>
        <td className="px-6 py-4 text-sm text-center text-gray-700">{shift.teams_count}</td>
        <td className="px-6 py-4">
          <Badge className={cn('text-xs', SHIFT_STATUS_STYLES[shift.status] || 'bg-gray-100 text-gray-600')}>
            {shift.status === 'active' ? 'Активна' : shift.status === 'scheduled' ? 'Запланирована' : 'Закрыта'}
          </Badge>
        </td>
        {(onActivate || onClose) && (
          <td className="px-6 py-4">
            <div className="flex items-center gap-2">
              {shift.status === 'active' && shift.qr_token && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setQrOpen(true)}
                  className="text-blue-600 border-blue-300 hover:bg-blue-50"
                  aria-label="Показать QR-код смены"
                  tabIndex={0}
                >
                  <QrCode className="w-3.5 h-3.5 mr-1" /> QR
                </Button>
              )}
              {shift.status === 'scheduled' && onActivate && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onActivate(shift.id)}
                  className="text-green-600 border-green-300 hover:bg-green-50"
                  aria-label="Активировать смену"
                  tabIndex={0}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Активировать
                </Button>
              )}
              {shift.status === 'active' && onClose && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onClose(shift.id)}
                  className="text-red-600 border-red-300 hover:bg-red-50"
                  aria-label="Закрыть смену"
                  tabIndex={0}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1" /> Закрыть
                </Button>
              )}
            </div>
          </td>
        )}
      </tr>

      {/* QR-код диалог */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>QR-код смены</DialogTitle>
            <DialogDescription>
              Покажите этот QR-код монтажникам для регистрации на смену
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <QRCodeSVG
                value={qrValue}
                size={256}
                level="M"
                includeMargin
              />
            </div>
            <div className="text-center text-sm text-gray-500 space-y-1">
              <p className="font-medium text-gray-700">
                {formatDate(shift.date)} · {SHIFT_TYPE_LABELS[shift.shift_type] || shift.shift_type}
              </p>
              <p>{shift.start_time?.slice(0, 5)} — {shift.end_time?.slice(0, 5)}</p>
              {shift.contractor_name && <p>{shift.contractor_name}</p>}
              {shift.contract_number && <p>Договор: {shift.contract_number}</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// --------------- Shifts Section ---------------

function ShiftsSection({
  objectId,
  data,
  isLoading,
  page,
  onPageChange,
  statusFilter,
  onStatusFilterChange,
}: {
  objectId: number;
  data: PaginatedResponse<WorklogShift> | undefined;
  isLoading: boolean;
  page: number;
  onPageChange: (p: number) => void;
  statusFilter: string;
  onStatusFilterChange: (f: string) => void;
}) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [shiftDate, setShiftDate] = useState(new Date().toISOString().slice(0, 10));
  const [shiftType, setShiftType] = useState('day');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('18:00');
  const [selectedContract, setSelectedContract] = useState('');

  const { data: contractsData } = useQuery({
    queryKey: ['object-contracts-for-shift', objectId],
    queryFn: () => api.getContracts({ object: objectId, contract_type: 'expense', page_size: 100 }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
    enabled: createOpen,
  });

  const contracts = contractsData?.results || [];

  const createMutation = useMutation({
    mutationFn: () => api.createWorklogShift({
      contract: parseInt(selectedContract),
      date: shiftDate,
      shift_type: shiftType,
      start_time: startTime + ':00',
      end_time: endTime + ':00',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklog-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['work-journal-summary'] });
      setCreateOpen(false);
      toast.success('Смена создана');
    },
    onError: () => toast.error('Ошибка при создании смены'),
  });

  const activateMutation = useMutation({
    mutationFn: (shiftId: string) => api.activateWorklogShift(shiftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklog-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['work-journal-summary'] });
      toast.success('Смена активирована');
    },
    onError: () => toast.error('Ошибка при активации смены'),
  });

  const closeMutation = useMutation({
    mutationFn: (shiftId: string) => api.closeWorklogShift(shiftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklog-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['work-journal-summary'] });
      toast.success('Смена закрыта');
    },
    onError: () => toast.error('Ошибка при закрытии смены'),
  });

  const handleCreate = () => {
    if (!selectedContract) {
      toast.error('Выберите договор');
      return;
    }
    createMutation.mutate();
  };

  const handleActivate = (shiftId: string) => activateMutation.mutate(shiftId);
  const handleClose = (shiftId: string) => closeMutation.mutate(shiftId);

  // Автозаполнение времени по типу смены
  const handleShiftTypeChange = (type: string) => {
    setShiftType(type);
    if (type === 'day') { setStartTime('08:00'); setEndTime('18:00'); }
    else if (type === 'evening') { setStartTime('18:00'); setEndTime('02:00'); }
    else if (type === 'night') { setStartTime('22:00'); setEndTime('08:00'); }
  };

  return (
    <div className="space-y-4">
      {/* Filters + Create button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={statusFilter}
            onChange={(e) => { onStatusFilterChange(e.target.value); onPageChange(1); }}
            aria-label="Фильтр по статусу"
          >
            <option value="">Все статусы</option>
            <option value="active">Активные</option>
            <option value="scheduled">Запланированные</option>
            <option value="closed">Закрытые</option>
          </select>
        </div>
        <Button onClick={() => setCreateOpen(true)} aria-label="Открыть смену" tabIndex={0}>
          <Plus className="w-4 h-4 mr-2" /> Открыть смену
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : !data || data.results.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Нет смен{statusFilter ? ' с выбранным фильтром' : ''}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Тип</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Время</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Договор</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Контрагент</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Регистрации</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Звенья</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.results.map((shift) => (
                  <ShiftRow key={shift.id} shift={shift} onActivate={handleActivate} onClose={handleClose} />
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar count={data.count} page={page} pageSize={10} onPageChange={onPageChange} />
        </div>
      )}

      {/* Диалог создания смены */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Открыть смену</DialogTitle>
            <DialogDescription>Создайте новую рабочую смену на объекте</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label htmlFor="shift-contract">Договор</Label>
              <Select value={selectedContract} onValueChange={setSelectedContract}>
                <SelectTrigger className="mt-1.5" id="shift-contract" aria-label="Выбор договора">
                  <SelectValue placeholder="Выберите договор" />
                </SelectTrigger>
                <SelectContent>
                  {contracts.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.number} — {c.name} ({c.counterparty_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="shift-date">Дата</Label>
              <Input
                id="shift-date"
                type="date"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
                className="mt-1.5"
                aria-label="Дата смены"
              />
            </div>
            <div>
              <Label htmlFor="shift-type">Тип смены</Label>
              <Select value={shiftType} onValueChange={handleShiftTypeChange}>
                <SelectTrigger className="mt-1.5" id="shift-type" aria-label="Тип смены">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Дневная</SelectItem>
                  <SelectItem value="evening">Вечерняя</SelectItem>
                  <SelectItem value="night">Ночная</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="shift-start">Начало</Label>
                <Input
                  id="shift-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1.5"
                  aria-label="Время начала"
                />
              </div>
              <div>
                <Label htmlFor="shift-end">Окончание</Label>
                <Input
                  id="shift-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1.5"
                  aria-label="Время окончания"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Создание...</>
                ) : (
                  <><Plus className="w-4 h-4 mr-2" /> Создать смену</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --------------- Media Section ---------------

function MediaSection({
  data,
  isLoading,
  page,
  onPageChange,
  typeFilter,
  onTypeFilterChange,
  tagFilter,
  onTagFilterChange,
}: {
  data: PaginatedResponse<WorklogMedia> | undefined;
  isLoading: boolean;
  page: number;
  onPageChange: (p: number) => void;
  typeFilter: string;
  onTypeFilterChange: (f: string) => void;
  tagFilter: string;
  onTagFilterChange: (f: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-gray-400" />
        <select
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={typeFilter}
          onChange={(e) => { onTypeFilterChange(e.target.value); onPageChange(1); }}
          aria-label="Фильтр по типу медиа"
        >
          <option value="">Все типы</option>
          <option value="photo">Фото</option>
          <option value="video">Видео</option>
          <option value="voice">Голосовые</option>
          <option value="text">Текст</option>
          <option value="document">Документы</option>
        </select>
        <select
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={tagFilter}
          onChange={(e) => { onTagFilterChange(e.target.value); onPageChange(1); }}
          aria-label="Фильтр по тегу"
        >
          <option value="">Все теги</option>
          <option value="progress">Прогресс</option>
          <option value="problem">Проблема</option>
          <option value="safety">Безопасность</option>
          <option value="result">Результат</option>
          <option value="other">Прочее</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : !data || data.results.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <Image className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Нет медиа{typeFilter || tagFilter ? ' с выбранными фильтрами' : ''}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.results.map((item) => (
              <MediaCard key={item.id} media={item} />
            ))}
          </div>
          <PaginationBar count={data.count} page={page} pageSize={12} onPageChange={onPageChange} />
        </>
      )}
    </div>
  );
}

// --------------- Media Card ---------------

function MediaCard({ media }: { media: WorklogMedia }) {
  const IconComponent = MEDIA_TYPE_ICONS[media.media_type] || FileText;
  const tagStyle = MEDIA_TAG_STYLES[media.tag] || MEDIA_TAG_STYLES.other;
  const isVisual = media.media_type === 'photo' || media.media_type === 'video';

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
      {/* Thumbnail area */}
      <div className="relative aspect-video bg-gray-100 flex items-center justify-center">
        {isVisual && media.thumbnail_url ? (
          <img
            src={media.thumbnail_url}
            alt={media.text_content || 'Медиа'}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <IconComponent className="w-10 h-10 text-gray-400" />
        )}
        {media.media_type === 'video' && media.thumbnail_url && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center">
              <Video className="w-5 h-5 text-white" />
            </div>
          </div>
        )}
        {media.tag && (
          <Badge className={cn('absolute top-2 right-2 text-xs', tagStyle)}>
            {media.tag === 'progress' ? 'Прогресс' : media.tag === 'problem' ? 'Проблема' : media.tag === 'safety' ? 'Безопасность' : media.tag === 'result' ? 'Результат' : media.tag}
          </Badge>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
          <IconComponent className="w-3.5 h-3.5" />
          <span>{media.media_type === 'photo' ? 'Фото' : media.media_type === 'video' ? 'Видео' : media.media_type === 'voice' ? 'Голосовое' : media.media_type === 'text' ? 'Текст' : media.media_type}</span>
        </div>
        <div className="text-sm text-gray-700 truncate">{media.author_name}</div>
        {media.text_content && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{media.text_content}</p>
        )}
        <div className="text-xs text-gray-400 mt-1">{formatDateTime(media.created_at)}</div>
      </div>
    </div>
  );
}

// --------------- Reports Section ---------------

function ReportsSection({
  data,
  isLoading,
  page,
  onPageChange,
  typeFilter,
  onTypeFilterChange,
  onReportClick,
}: {
  data: PaginatedResponse<WorklogReport> | undefined;
  isLoading: boolean;
  page: number;
  onPageChange: (p: number) => void;
  typeFilter: string;
  onTypeFilterChange: (f: string) => void;
  onReportClick?: (reportId: string) => void;
}) {
  const reportTypeLabels: Record<string, string> = {
    intermediate: 'Промежуточный',
    final: 'Итоговый',
    supplement: 'Дополнение',
  };

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-gray-400" />
        <select
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={typeFilter}
          onChange={(e) => { onTypeFilterChange(e.target.value); onPageChange(1); }}
          aria-label="Фильтр по типу отчёта"
        >
          <option value="">Все типы</option>
          <option value="intermediate">Промежуточные</option>
          <option value="final">Итоговые</option>
          <option value="supplement">Дополнения</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : !data || data.results.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Нет отчётов{typeFilter ? ' с выбранным фильтром' : ''}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">№</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Тип</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Звено</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Медиа</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Создан</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.results.map((report) => (
                  <tr
                    key={report.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => onReportClick?.(report.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Открыть отчёт #${report.report_number}`}
                    onKeyDown={(e) => { if (e.key === 'Enter') onReportClick?.(report.id); }}
                  >
                    <td className="px-6 py-4 text-sm font-mono text-gray-900">#{report.report_number}</td>
                    <td className="px-6 py-4 text-sm">
                      <Badge className={cn('text-xs',
                        report.report_type === 'final' ? 'bg-green-100 text-green-700'
                        : report.report_type === 'intermediate' ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                      )}>
                        {reportTypeLabels[report.report_type] || report.report_type}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{report.team_name || '—'}</td>
                    <td className="px-6 py-4 text-sm text-center text-gray-700">{report.media_count}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{report.status}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDateTime(report.created_at)}</td>
                    <td className="px-6 py-4">
                      <Button variant="ghost" size="sm" aria-label="Просмотр" tabIndex={-1}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar count={data.count} page={page} pageSize={10} onPageChange={onPageChange} />
        </div>
      )}
    </div>
  );
}

// --------------- Pagination Bar ---------------

function PaginationBar({
  count,
  page,
  pageSize,
  onPageChange,
}: {
  count: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.ceil(count / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
      <div className="text-sm text-gray-500">
        Всего: {count}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="p-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Предыдущая страница"
          tabIndex={0}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-gray-700 min-w-[80px] text-center">
          {page} из {totalPages}
        </span>
        <button
          type="button"
          className="p-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Следующая страница"
          tabIndex={0}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// --------------- Report Detail Dialog ---------------

function ReportDetailDialog({
  reportId,
  open,
  onOpenChange,
}: {
  reportId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [questionText, setQuestionText] = useState('');
  const [answerTexts, setAnswerTexts] = useState<Record<string, string>>({});

  const { data: report, isLoading } = useQuery({
    queryKey: ['worklog-report-detail', reportId],
    queryFn: () => api.getWorklogReportDetail(reportId!),
    enabled: !!reportId && open,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const askMutation = useMutation({
    mutationFn: (text: string) => api.createWorklogQuestion({ report_id: reportId!, text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklog-report-detail', reportId] });
      setQuestionText('');
      toast.success('Вопрос отправлен');
    },
    onError: () => toast.error('Ошибка при отправке вопроса'),
  });

  const answerMutation = useMutation({
    mutationFn: ({ questionId, text }: { questionId: string; text: string }) =>
      api.answerWorklogQuestion(questionId, { text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['worklog-report-detail', reportId] });
      setAnswerTexts({});
      toast.success('Ответ отправлен');
    },
    onError: () => toast.error('Ошибка при отправке ответа'),
  });

  const handleAskQuestion = () => {
    if (!questionText.trim()) return;
    askMutation.mutate(questionText.trim());
  };

  const handleAnswer = (questionId: string) => {
    const text = answerTexts[questionId]?.trim();
    if (!text) return;
    answerMutation.mutate({ questionId, text });
  };

  const reportTypeLabels: Record<string, string> = {
    intermediate: 'Промежуточный',
    final: 'Итоговый',
    supplement: 'Дополнение',
  };

  const mediaTypeIcon: Record<string, typeof Camera> = {
    photo: Camera,
    video: Video,
    voice: Mic,
    audio: Mic,
    text: FileText,
    document: FileSpreadsheet,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {report ? `${reportTypeLabels[report.report_type] || report.report_type} отчёт #${report.report_number}` : 'Отчёт'}
          </DialogTitle>
          <DialogDescription>
            {report?.team_name ? `Звено: ${report.team_name}` : ''}
            {report?.created_at ? ` • ${formatDateTime(report.created_at)}` : ''}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : report ? (
          <div className="space-y-6 py-2">
            {/* Сводка */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-gray-900">{report.media_count}</div>
                <div className="text-xs text-gray-500">Медиа</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-gray-900">{report.questions?.length || 0}</div>
                <div className="text-xs text-gray-500">Вопросы</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-gray-900">{report.status}</div>
                <div className="text-xs text-gray-500">Статус</div>
              </div>
            </div>

            {/* Медиа */}
            {report.media_items && report.media_items.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Image className="w-4 h-4" /> Медиа ({report.media_items.length})
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {report.media_items.map((item) => {
                    const IconComp = mediaTypeIcon[item.media_type] || FileText;
                    const isVisual = item.media_type === 'photo' || item.media_type === 'video';
                    return (
                      <div key={item.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="aspect-square bg-gray-100 flex items-center justify-center">
                          {isVisual && item.thumbnail_url ? (
                            <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <IconComp className="w-8 h-8 text-gray-400" />
                          )}
                        </div>
                        <div className="p-2">
                          <div className="text-xs text-gray-500 truncate">{item.author_name}</div>
                          {item.text_content && <div className="text-xs text-gray-600 truncate mt-0.5">{item.text_content}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Вопросы / Ответы */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <MessageCircle className="w-4 h-4" /> Вопросы и ответы
              </h4>

              {report.questions && report.questions.length > 0 ? (
                <div className="space-y-3">
                  {report.questions.map((q) => (
                    <div key={q.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <div className={cn('mt-0.5', q.status === 'answered' ? 'text-green-500' : 'text-amber-500')}>
                          {q.status === 'answered' ? <CheckCircle2 className="w-4 h-4" /> : <FileQuestion className="w-4 h-4" />}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-gray-900">{q.text}</div>
                          <div className="text-xs text-gray-400 mt-1">{q.author_name} • {formatDateTime(q.created_at)}</div>
                        </div>
                      </div>

                      {/* Ответы */}
                      {q.answers && q.answers.map((a) => (
                        <div key={a.id} className="ml-6 mt-2 pl-3 border-l-2 border-blue-200">
                          <div className="text-sm text-gray-700">{a.text}</div>
                          <div className="text-xs text-gray-400 mt-1">{a.author_name} • {formatDateTime(a.created_at)}</div>
                        </div>
                      ))}

                      {/* Форма ответа */}
                      {q.status === 'pending' && (
                        <div className="ml-6 mt-2 flex gap-2">
                          <Input
                            placeholder="Ответить..."
                            value={answerTexts[q.id] || ''}
                            onChange={(e) => setAnswerTexts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                            className="text-sm"
                            aria-label={`Ответ на вопрос: ${q.text}`}
                          />
                          <Button
                            size="sm"
                            disabled={!answerTexts[q.id]?.trim() || answerMutation.isPending}
                            onClick={() => handleAnswer(q.id)}
                            aria-label="Отправить ответ"
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Вопросов нет</p>
              )}

              {/* Новый вопрос */}
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder="Задать вопрос по отчёту..."
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  className="text-sm"
                  aria-label="Задать новый вопрос"
                />
                <Button
                  size="sm"
                  disabled={!questionText.trim() || askMutation.isPending}
                  onClick={handleAskQuestion}
                  aria-label="Отправить вопрос"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">Не удалось загрузить отчёт</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --------------- Geo Settings Section ---------------

function GeoSettingsSection({ objectId }: { objectId: number }) {
  const queryClient = useQueryClient();
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [geoRadius, setGeoRadius] = useState('200');
  const [allowGeoBypass, setAllowGeoBypass] = useState(false);
  const [registrationWindow, setRegistrationWindow] = useState('0');
  const [hasLoaded, setHasLoaded] = useState(false);

  const { data: object } = useQuery({
    queryKey: ['construction-object', objectId],
    queryFn: () => api.getConstructionObjectById(objectId),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Заполняем форму данными объекта при загрузке
  if (object && !hasLoaded) {
    if ((object as any).latitude) setLatitude((object as any).latitude);
    if ((object as any).longitude) setLongitude((object as any).longitude);
    if ((object as any).geo_radius) setGeoRadius(String((object as any).geo_radius));
    if ((object as any).allow_geo_bypass !== undefined) setAllowGeoBypass((object as any).allow_geo_bypass);
    if ((object as any).registration_window_minutes !== undefined) setRegistrationWindow(String((object as any).registration_window_minutes));
    setHasLoaded(true);
  }

  const updateMutation = useMutation({
    mutationFn: () => api.updateObjectGeo(objectId, {
      latitude: latitude || undefined,
      longitude: longitude || undefined,
      geo_radius: geoRadius ? parseInt(geoRadius) : undefined,
      allow_geo_bypass: allowGeoBypass,
      registration_window_minutes: registrationWindow ? parseInt(registrationWindow) : 0,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction-object', objectId] });
      toast.success('Гео-настройки сохранены');
    },
    onError: () => toast.error('Ошибка при сохранении'),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Globe className="w-5 h-5 text-blue-600" /> Гео-настройки объекта
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Укажите координаты центра объекта и радиус допустимой зоны для регистрации на смену через Mini App.
      </p>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="geo-lat">Широта (Latitude)</Label>
            <Input
              id="geo-lat"
              type="text"
              inputMode="decimal"
              placeholder="55.7558"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              className="mt-1.5"
              aria-label="Широта объекта"
            />
          </div>
          <div>
            <Label htmlFor="geo-lng">Долгота (Longitude)</Label>
            <Input
              id="geo-lng"
              type="text"
              inputMode="decimal"
              placeholder="37.6173"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              className="mt-1.5"
              aria-label="Долгота объекта"
            />
          </div>
          <div>
            <Label htmlFor="geo-radius">Радиус (метры)</Label>
            <Input
              id="geo-radius"
              type="number"
              min="50"
              max="50000"
              step="50"
              placeholder="200"
              value={geoRadius}
              onChange={(e) => setGeoRadius(e.target.value)}
              className="mt-1.5"
              aria-label="Радиус гео-зоны"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <input
            id="allow-geo-bypass"
            type="checkbox"
            checked={allowGeoBypass}
            onChange={(e) => setAllowGeoBypass(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
            aria-label="Разрешить регистрацию вне геозоны"
          />
          <div>
            <Label htmlFor="allow-geo-bypass" className="cursor-pointer font-medium text-gray-700">
              Разрешить регистрацию вне геозоны
            </Label>
            <p className="text-xs text-gray-500 mt-0.5">
              Если включено, монтажники смогут регистрироваться находясь за пределами геозоны (с пометкой). По умолчанию регистрация вне зоны заблокирована.
            </p>
          </div>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="reg-window" className="font-medium text-gray-700">
                Окно регистрации (минуты)
              </Label>
              <p className="text-xs text-gray-500 mt-0.5">
                За сколько минут до начала и после окончания смены разрешена регистрация. 0 = без ограничений.
              </p>
            </div>
            <Input
              id="reg-window"
              type="number"
              min="0"
              max="1440"
              step="5"
              placeholder="0"
              value={registrationWindow}
              onChange={(e) => setRegistrationWindow(e.target.value)}
              className="w-24"
              aria-label="Окно регистрации в минутах"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Сохранение...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" /> Сохранить настройки</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

// --------------- Supergroup Management Section ---------------

function SupergroupSection({ objectId }: { objectId: number }) {
  const { data: supergroups, isLoading } = useQuery({
    queryKey: ['worklog-supergroups', objectId],
    queryFn: () => api.getWorklogSupergroups({ object: objectId }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  const groups = supergroups?.results || [];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Settings className="w-5 h-5 text-blue-600" /> Telegram-супергруппы
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Супергруппы Telegram привязаны к объекту для фиксации работ. Каждое звено получает отдельный топик в группе.
      </p>

      {groups.length === 0 ? (
        <div className="text-center py-8">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Нет привязанных супергрупп</p>
          <p className="text-gray-400 text-xs mt-1">Супергруппы создаются автоматически при открытии смены через бота</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className={cn('w-3 h-3 rounded-full', group.is_active ? 'bg-green-500' : 'bg-gray-400')} />
                <div>
                  <div className="text-sm font-medium text-gray-900">{group.chat_title}</div>
                  <div className="text-xs text-gray-500">
                    {group.contractor_name} • ID: {group.telegram_chat_id}
                  </div>
                  <div className="text-xs text-gray-400">{formatDateTime(group.created_at)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {group.is_active ? (
                  <Badge className="bg-green-100 text-green-700 text-xs">Активна</Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-600 text-xs">Неактивна</Badge>
                )}
                {group.invite_link && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(group.invite_link, '_blank')}
                    aria-label={`Открыть ссылку на группу ${group.chat_title}`}
                  >
                    <Link2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------- Invite Section ---------------

function InviteSection({ objectId }: { objectId: number }) {
  const queryClient = useQueryClient();
  const [selectedContractor, setSelectedContractor] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('worker');
  const [generatedLink, setGeneratedLink] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const { data: counterparties } = useQuery({
    queryKey: ['counterparties'],
    queryFn: () => api.getCounterparties(),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: invites, isLoading: invitesLoading } = useQuery({
    queryKey: ['worklog-invites', selectedContractor],
    queryFn: () => api.getInviteTokens({
      ...(selectedContractor ? { contractor: parseInt(selectedContractor) } : {}),
      page_size: 10,
    }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const createMutation = useMutation({
    mutationFn: () => api.createInviteToken({
      contractor: parseInt(selectedContractor),
      role: selectedRole,
    }),
    onSuccess: (data) => {
      setGeneratedLink(data.bot_link);
      setCopied(false);
      queryClient.invalidateQueries({ queryKey: ['worklog-invites'] });
      toast.success('Приглашение создано');
    },
    onError: () => toast.error('Ошибка при создании приглашения'),
  });

  const handleCreate = () => {
    if (!selectedContractor) {
      toast.error('Выберите контрагента');
      return;
    }
    createMutation.mutate();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      toast.success('Ссылка скопирована');
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const inviteList = invites?.results || [];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <UserPlus className="w-5 h-5 text-blue-600" /> Пригласить монтажника
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Создайте ссылку-приглашение и отправьте её монтажнику. Он откроет ссылку в Telegram,
        бот попросит ввести ФИО и выбрать язык — и монтажник будет зарегистрирован автоматически.
      </p>

      {/* Форма создания */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <Label htmlFor="invite-contractor">Контрагент</Label>
          <Select value={selectedContractor} onValueChange={setSelectedContractor}>
            <SelectTrigger className="mt-1.5" id="invite-contractor" aria-label="Выбор контрагента">
              <SelectValue placeholder="Выберите контрагента" />
            </SelectTrigger>
            <SelectContent>
              {(counterparties || []).map((c: Counterparty) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.short_name || c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="invite-role">Роль</Label>
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="mt-1.5" id="invite-role" aria-label="Выбор роли">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="worker">Монтажник</SelectItem>
              <SelectItem value="brigadier">Бригадир</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            onClick={handleCreate}
            disabled={!selectedContractor || createMutation.isPending}
            className="w-full"
            aria-label="Создать приглашение"
          >
            {createMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Создание...</>
            ) : (
              <><UserPlus className="w-4 h-4 mr-2" /> Создать приглашение</>
            )}
          </Button>
        </div>
      </div>

      {/* Сгенерированная ссылка */}
      {generatedLink && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-green-800 mb-1">Ссылка готова!</div>
              <div className="text-xs text-green-700 font-mono truncate">{generatedLink}</div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className={cn(
                  'transition-colors',
                  copied ? 'border-green-500 text-green-700' : ''
                )}
                aria-label="Скопировать ссылку"
                tabIndex={0}
              >
                {copied ? (
                  <><CheckCircle2 className="w-4 h-4 mr-1" /> Скопировано</>
                ) : (
                  <><Copy className="w-4 h-4 mr-1" /> Скопировать</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(generatedLink, '_blank')}
                aria-label="Открыть ссылку"
                tabIndex={0}
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Список приглашений */}
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Последние приглашения</h4>
        {invitesLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          </div>
        ) : inviteList.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Нет приглашений</p>
        ) : (
          <div className="space-y-2">
            {inviteList.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between border border-gray-200 rounded-lg px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    'w-2.5 h-2.5 rounded-full flex-shrink-0',
                    invite.is_valid ? 'bg-green-500' : (invite.used ? 'bg-blue-500' : 'bg-gray-400')
                  )} />
                  <div className="min-w-0">
                    <div className="text-sm text-gray-900 font-mono truncate">
                      {invite.code}
                    </div>
                    <div className="text-xs text-gray-500">
                      {invite.contractor_name}
                      {' • '}
                      {invite.role === 'brigadier' ? 'Бригадир' : 'Монтажник'}
                      {' • '}
                      {formatDateTime(invite.created_at)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {invite.used ? (
                    <Badge className="bg-blue-100 text-blue-700 text-xs">
                      {invite.used_by_name || 'Использован'}
                    </Badge>
                  ) : invite.is_valid ? (
                    <Badge className="bg-green-100 text-green-700 text-xs">Активен</Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-600 text-xs">Истёк</Badge>
                  )}
                  {invite.is_valid && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(invite.bot_link);
                          toast.success('Ссылка скопирована');
                        } catch {
                          toast.error('Не удалось скопировать');
                        }
                      }}
                      aria-label={`Скопировать ссылку приглашения ${invite.code}`}
                      tabIndex={0}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Экспорты для тестирования worklog-компонентов
export {
  WorkJournalTab,
  SummaryCard,
  OverviewSection,
  ShiftsSection,
  MediaSection,
  MediaCard,
  PaginationBar,
  ReportsSection,
  ReportDetailDialog,
  GeoSettingsSection,
  SupergroupSection,
  InviteSection,
};

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