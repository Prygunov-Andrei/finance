import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDate, formatCurrency } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ArrowLeft, Loader2, FileSpreadsheet, Info, DollarSign, History, Users, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_MAP = {
  draft: { label: 'Черновик', color: 'bg-gray-100 text-gray-700' },
  sent: { label: 'Отправлена', color: 'bg-blue-100 text-blue-700' },
  approved: { label: 'Согласована', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Отклонена', color: 'bg-red-100 text-red-700' },
};

export function MountingEstimateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isVersionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [isAgreeDialogOpen, setAgreeDialogOpen] = useState(false);
  const [isEditDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedCounterparty, setSelectedCounterparty] = useState<number>(0);

  const [editForm, setEditForm] = useState({
    name: '',
    total_amount: '',
    man_hours: '',
  });

  const { data: mountingEstimate, isLoading } = useQuery({
    queryKey: ['mounting-estimate', id],
    queryFn: () => api.getMountingEstimateDetail(Number(id)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: counterparties } = useQuery({
    queryKey: ['counterparties'],
    queryFn: () => api.getCounterparties(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => api.updateMountingEstimate(Number(id), { status } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mounting-estimate', id] });
      toast.success('Статус обновлен');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const updateMountingEstimateMutation = useMutation({
    mutationFn: (data: any) => api.updateMountingEstimate(Number(id), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mounting-estimate', id] });
      setEditDialogOpen(false);
      toast.success('Монтажная смета обновлена');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: () => api.createMountingEstimateVersion(Number(id)),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['mounting-estimates'] });
      toast.success('Новая версия создана');
      navigate(`/estimates/mounting-estimates/${data.id}`);
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const agreeMutation = useMutation({
    mutationFn: (counterpartyId: number) => api.agreeMountingEstimate(Number(id), counterpartyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mounting-estimate', id] });
      setAgreeDialogOpen(false);
      setSelectedCounterparty(0);
      toast.success('Монтажная смета согласована с Исполнителем');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const handleCreateVersion = () => {
    if (window.confirm('Создать новую версию монтажной сметы? Текущая версия будет помечена как неактуальная.')) {
      createVersionMutation.mutate();
    }
  };

  const handleAgree = () => {
    if (!selectedCounterparty) {
      toast.error('Выберите Исполнителя');
      return;
    }
    agreeMutation.mutate(selectedCounterparty);
  };

  const handleEdit = () => {
    if (!mountingEstimate) return;
    setEditForm({
      name: mountingEstimate.name,
      total_amount: mountingEstimate.total_amount,
      man_hours: mountingEstimate.man_hours,
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = () => {
    if (!editForm.name.trim()) {
      toast.error('Введите название');
      return;
    }
    updateMountingEstimateMutation.mutate({
      name: editForm.name,
      total_amount: editForm.total_amount,
      man_hours: editForm.man_hours,
    });
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

  if (!mountingEstimate) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Монтажная смета не найдена</p>
          <Button variant="outline" onClick={() => navigate('/estimates/mounting-estimates')} className="mt-4">
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
          <Button variant="ghost" size="sm" onClick={() => navigate('/estimates/mounting-estimates')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">{mountingEstimate.number}</h1>
              <span className="text-sm text-gray-500">v{mountingEstimate.version_number}</span>
              <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-md ${STATUS_MAP[mountingEstimate.status as keyof typeof STATUS_MAP]?.color}`}>
                {STATUS_MAP[mountingEstimate.status as keyof typeof STATUS_MAP]?.label}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">{mountingEstimate.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleEdit}>
            <Edit2 className="w-4 h-4 mr-2" />
            Редактировать
          </Button>
          <Button variant="outline" onClick={handleCreateVersion}>
            <History className="w-4 h-4 mr-2" />
            Новая версия
          </Button>
          {mountingEstimate.status === 'sent' && !mountingEstimate.agreed_counterparty && (
            <Button onClick={() => setAgreeDialogOpen(true)} className="bg-green-600 hover:bg-green-700">
              <Users className="w-4 h-4 mr-2" />
              Согласовать
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="info" className="space-y-6">
        <TabsList>
          <TabsTrigger value="info">
            <Info className="w-4 h-4 mr-2" />
            Информация
          </TabsTrigger>
          <TabsTrigger value="totals">
            <DollarSign className="w-4 h-4 mr-2" />
            Итоги
          </TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info" className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Основная информация</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500">Номер</div>
                <div className="font-medium text-gray-900">{mountingEstimate.number}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Название</div>
                <div className="font-medium text-gray-900">{mountingEstimate.name}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Объект</div>
                <div className="font-medium text-gray-900">{mountingEstimate.object_name}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Статус</div>
                <div>
                  <select
                    value={mountingEstimate.status}
                    onChange={(e) => updateStatusMutation.mutate(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Человеко-часы</div>
                <div className="font-medium text-gray-900">{mountingEstimate.man_hours}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Создал</div>
                <div className="font-medium text-gray-900">{mountingEstimate.created_by_username}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Дата создания</div>
                <div className="font-medium text-gray-900">{formatDate(mountingEstimate.created_at)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Последнее обновление</div>
                <div className="font-medium text-gray-900">{formatDate(mountingEstimate.updated_at)}</div>
              </div>
            </div>

            {mountingEstimate.source_estimate && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm text-gray-500 mb-2">Исходная смета</div>
                <button
                  onClick={() => navigate(`/estimates/estimates/${mountingEstimate.source_estimate?.id}`)}
                  className="text-blue-600 hover:underline font-medium"
                >
                  {mountingEstimate.source_estimate.number} - {mountingEstimate.source_estimate.name}
                </button>
              </div>
            )}

            {mountingEstimate.agreed_counterparty && (
              <div className="mt-4 pt-4 border-t">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Users className="w-5 h-5 text-green-600 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold text-green-900">Согласовано с Исполнителем</div>
                      <div className="text-sm text-green-700 mt-1">
                        {mountingEstimate.agreed_counterparty_name}
                      </div>
                      <div className="text-xs text-green-600 mt-1">
                        {formatDate(mountingEstimate.agreed_date)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Works Section */}
          {mountingEstimate.works && mountingEstimate.works.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Работы</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Название</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Количество</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Цена за ед.</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Итого</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {mountingEstimate.works.map((work) => (
                      <tr key={work.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{work.name}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700">{work.quantity}</td>
                        <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(work.unit_price)}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{formatCurrency(work.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Totals Tab */}
        <TabsContent value="totals" className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-6">Итоги по монтажной смете</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-4 border-b border-gray-300">
                <span className="text-lg font-semibold text-gray-900">Итоговая сумма без НДС</span>
                <span className="text-lg font-semibold text-gray-900">{formatCurrency(mountingEstimate.total_amount)}</span>
              </div>

              {mountingEstimate.with_vat && (
                <>
                  <div className="flex justify-between items-center py-3 border-b">
                    <span className="text-gray-600">НДС ({mountingEstimate.vat_rate}%)</span>
                    <span className="font-medium text-gray-900">{formatCurrency(mountingEstimate.vat_amount)}</span>
                  </div>
                  <div className="flex justify-between items-center py-4 bg-blue-50 rounded-lg px-4">
                    <span className="text-xl font-semibold text-gray-900">Итого с НДС</span>
                    <span className="text-xl font-semibold text-blue-600">{formatCurrency(mountingEstimate.total_with_vat)}</span>
                  </div>
                </>
              )}

              <div className="pt-4 border-t">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Человеко-часы</span>
                  <span className="font-medium text-gray-900">{mountingEstimate.man_hours}</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Редактировать монтажную смету</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="edit_name">Название *</Label>
              <Input
                id="edit_name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="edit_amount">Итоговая сумма *</Label>
              <Input
                id="edit_amount"
                type="number"
                step="0.01"
                value={editForm.total_amount}
                onChange={(e) => setEditForm({ ...editForm, total_amount: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="edit_hours">Человеко-часы</Label>
              <Input
                id="edit_hours"
                type="number"
                step="0.01"
                value={editForm.man_hours}
                onChange={(e) => setEditForm({ ...editForm, man_hours: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleEditSubmit} className="bg-blue-600 hover:bg-blue-700">
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agree Dialog */}
      <Dialog open={isAgreeDialogOpen} onOpenChange={setAgreeDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Согласовать с Исполнителем</DialogTitle>
            <DialogDescription>
              Выберите Исполнителя для согласования монтажной сметы
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="counterparty">Исполнитель *</Label>
              <select
                id="counterparty"
                value={selectedCounterparty}
                onChange={(e) => setSelectedCounterparty(Number(e.target.value))}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={0}>Выберите исполнителя</option>
                {counterparties?.filter(c => c.type === 'supplier' || c.type === 'both').map((cp) => (
                  <option key={cp.id} value={cp.id}>{cp.name}</option>
                ))}
              </select>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <p>💡 После согласования статус автоматически изменится на "Согласована"</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAgreeDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleAgree} className="bg-green-600 hover:bg-green-700">
              Согласовать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}