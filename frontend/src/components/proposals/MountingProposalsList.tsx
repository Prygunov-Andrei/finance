import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { 
  Plus, 
  Search, 
  FileText, 
  Copy, 
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { CreateMountingProposalDialog } from './CreateMountingProposalDialog';
import { useObjects, useCounterparties } from '../../hooks';
import { CONSTANTS } from '../../constants';
import { formatDate, formatCurrency } from '../../lib/utils';

export function MountingProposalsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  
  // Фильтры
  const [searchQuery, setSearchQuery] = useState('');
  const [objectFilter, setObjectFilter] = useState('');
  const [counterpartyFilter, setCounterpartyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tkpFilter, setTkpFilter] = useState('');
  const [page, setPage] = useState(1);

  // Загрузка МП
  const { data: mpData, isLoading } = useQuery({
    queryKey: ['mounting-proposals', objectFilter, counterpartyFilter, statusFilter, searchQuery, tkpFilter, page],
    queryFn: () => api.getMountingProposals({
      object: objectFilter || undefined,
      counterparty: counterpartyFilter || undefined,
      status: statusFilter || undefined,
      search: searchQuery || undefined,
      parent_tkp: tkpFilter || undefined,
    }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Загрузка справочников для фильтров с кешированием
  const { data: objects } = useObjects();
  const { data: counterparties } = useCounterparties();

  // Загрузка ТКП для фильтра
  const { data: tkpList } = useQuery({
    queryKey: ['technical-proposals'],
    queryFn: () => api.getTechnicalProposals(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Удаление МП
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteMountingProposal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mounting-proposals'] });
      toast.success('МП удалено');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Создание версии
  const createVersionMutation = useMutation({
    mutationFn: (id: number) => api.createMountingProposalVersion(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['mounting-proposals'] });
      toast.success('Версия создана');
      navigate(`/proposals/mounting-proposals/${data.id}`);
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Публикация в Telegram
  const publishToTelegramMutation = useMutation({
    mutationFn: (id: number) => api.publishMountingProposalToTelegram(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mounting-proposals'] });
      toast.success('МП опубликовано в Telegram');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Вы уверены, что хотите удалить МП "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleCreateVersion = (id: number, versionNumber: number) => {
    if (confirm(`Создать новую версию МП? Текущая версия: ${versionNumber}. Новая версия будет: ${versionNumber + 1}`)) {
      createVersionMutation.mutate(id);
    }
  };

  const handlePublishToTelegram = (id: number, number: string) => {
    if (confirm(`Опубликовать МП ${number} в Telegram?`)) {
      publishToTelegramMutation.mutate(id);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { label: 'Черновик', className: 'bg-gray-100 text-gray-800', icon: Clock },
      published: { label: 'Опубликовано', className: 'bg-blue-100 text-blue-800', icon: FileText },
      sent: { label: 'Отправлено', className: 'bg-purple-100 text-purple-800', icon: Send },
      approved: { label: 'Утверждено', className: 'bg-green-100 text-green-800', icon: CheckCircle2 },
      rejected: { label: 'Отклонено', className: 'bg-red-100 text-red-800', icon: XCircle },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    const Icon = config.icon;
    return (
      <Badge className={config.className}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const mpList = mpData?.results || [];
  const totalPages = mpData?.count ? Math.ceil(mpData.count / 20) : 1;

  return (
    <div className="p-6 space-y-6">
      {/* Заголовок */}
      <div className="flex justify-between items-center">
        <h1 className="text-gray-900">Монтажные Предложения</h1>
        <Button 
          onClick={() => setIsCreateDialogOpen(true)}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Создать МП
        </Button>
      </div>

      {/* Фильтры */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <Label>Поиск</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Номер или название..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div>
            <Label>Объект</Label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={objectFilter}
              onChange={(e) => setObjectFilter(e.target.value)}
            >
              <option value="">Все объекты</option>
              {objects?.results?.map((obj) => (
                <option key={obj.id} value={obj.id}>{obj.name}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>Контрагент</Label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={counterpartyFilter}
              onChange={(e) => setCounterpartyFilter(e.target.value)}
            >
              <option value="">Все контрагенты</option>
              {counterparties?.results?.map((cp) => (
                <option key={cp.id} value={cp.id}>{cp.name}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>ТКП</Label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={tkpFilter}
              onChange={(e) => setTkpFilter(e.target.value)}
            >
              <option value="">Все ТКП</option>
              {tkpList?.results?.map((tkp) => (
                <option key={tkp.id} value={tkp.id}>{tkp.number} - {tkp.name}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>Статус</Label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Все статусы</option>
              <option value="draft">Черновик</option>
              <option value="published">Опубликовано</option>
              <option value="sent">Отправлено</option>
              <option value="approved">Утверждено</option>
              <option value="rejected">Отклонено</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => {
              setSearchQuery('');
              setObjectFilter('');
              setCounterpartyFilter('');
              setStatusFilter('');
              setTkpFilter('');
            }}
            className="bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Сбросить фильтры
          </Button>
        </div>
      </div>

      {/* Таблица */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-gray-600">Номер</th>
                <th className="px-4 py-3 text-left text-gray-600">Название</th>
                <th className="px-4 py-3 text-left text-gray-600">Дата</th>
                <th className="px-4 py-3 text-left text-gray-600">Объект</th>
                <th className="px-4 py-3 text-left text-gray-600">Контрагент</th>
                <th className="px-4 py-3 text-left text-gray-600">ТКП</th>
                <th className="px-4 py-3 text-left text-gray-600">Статус</th>
                <th className="px-4 py-3 text-right text-gray-600">Сумма</th>
                <th className="px-4 py-3 text-center text-gray-600">Версия</th>
                <th className="px-4 py-3 text-right text-gray-600">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    Загрузка...
                  </td>
                </tr>
              ) : mpList.length > 0 ? (
                mpList.map((mp) => (
                  <tr key={mp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/proposals/mounting-proposals/${mp.id}`)}
                        className="text-blue-600 hover:underline"
                      >
                        {mp.number}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-xs truncate text-gray-900">{mp.name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(mp.date)}</td>
                    <td className="px-4 py-3">
                      <div className="max-w-xs truncate text-gray-600">{mp.object_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-xs truncate text-gray-600">
                        {mp.counterparty_name || <span className="text-gray-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {mp.parent_tkp_number ? (
                        <button
                          onClick={() => navigate(`/proposals/technical-proposals/${mp.parent_tkp}`)}
                          className="text-blue-600 hover:underline"
                        >
                          {mp.parent_tkp_number}
                        </button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(mp.status)}</td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {formatCurrency(mp.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {mp.parent_version && (
                          <FileText className="w-3 h-3 text-gray-400" />
                        )}
                        <span className="text-gray-600">v{mp.version_number}</span>
                        {mp.telegram_published && (
                          <Send className="w-3 h-3 text-green-600 ml-1" title="Опубликовано в Telegram" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          onClick={() => navigate(`/proposals/mounting-proposals/${mp.id}`)}
                          className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3"
                          title="Открыть"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        {!mp.telegram_published && mp.status === 'published' && (
                          <Button
                            onClick={() => handlePublishToTelegram(mp.id, mp.number)}
                            className="bg-green-100 text-green-700 hover:bg-green-200 px-3"
                            title="Опубликовать в Telegram"
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          onClick={() => handleCreateVersion(mp.id, mp.version_number)}
                          className="bg-purple-100 text-purple-700 hover:bg-purple-200 px-3"
                          title="Создать версию"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => handleDelete(mp.id, mp.name)}
                          className="bg-red-100 text-red-700 hover:bg-red-200 px-3"
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    Нет данных
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Пагинация */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-gray-200 bg-gray-50">
            <div className="text-gray-600">
              Всего: {mpData?.count || 0} записей
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center px-4 text-gray-700">
                Страница {page} из {totalPages}
              </div>
              <Button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Диалог создания */}
      <CreateMountingProposalDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  );
}
