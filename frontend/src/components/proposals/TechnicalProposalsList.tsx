import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Plus, Search, Trash2, Copy, FileText } from 'lucide-react';
import { api, TechnicalProposalListItem } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';
import { CreateTechnicalProposalDialog } from './CreateTechnicalProposalDialog';
import { useObjects, useLegalEntities } from '../../hooks';
import { formatDate, formatCurrency } from '../../lib/utils';
import { CONSTANTS } from '../../constants';

export function TechnicalProposalsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [objectFilter, setObjectFilter] = useState('');
  const [legalEntityFilter, setLegalEntityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Загрузка ТКП
  const { data: tkpData, isLoading } = useQuery({
    queryKey: ['technical-proposals', { search: searchQuery, object: objectFilter, legal_entity: legalEntityFilter, status: statusFilter }],
    queryFn: () => api.getTechnicalProposals({
      search: searchQuery || undefined,
      object: objectFilter ? parseInt(objectFilter) : undefined,
      legal_entity: legalEntityFilter ? parseInt(legalEntityFilter) : undefined,
      status: statusFilter || undefined,
    }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Загрузка справочников для фильтров с кешированием
  const { data: objects } = useObjects();
  const { data: legalEntities } = useLegalEntities();

  // Удаление ТКП
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteTechnicalProposal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['technical-proposals'] });
      toast.success('ТКП удалено');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Создание версии
  const createVersionMutation = useMutation({
    mutationFn: (id: number) => api.createTechnicalProposalVersion(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['technical-proposals'] });
      toast.success('Версия создана');
      navigate(`/proposals/technical-proposals/${data.id}`);
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Вы уверены, что хотите удалить ТКП "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleCreateVersion = (id: number, versionNumber: number) => {
    if (confirm(`Создать новую версию ТКП? Текущая версия: ${versionNumber}. Новая версия будет: ${versionNumber + 1}`)) {
      createVersionMutation.mutate(id);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { label: 'Черновик', className: 'bg-gray-100 text-gray-800' },
      in_progress: { label: 'В работе', className: 'bg-blue-100 text-blue-800' },
      checking: { label: 'На проверке', className: 'bg-yellow-100 text-yellow-800' },
      approved: { label: 'Утверждено', className: 'bg-green-100 text-green-800' },
      sent: { label: 'Отправлено', className: 'bg-purple-100 text-purple-800' },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const tkpList = tkpData?.results || [];

  return (
    <div className="p-6 space-y-6">
      {/* Заголовок */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl">Технико-Коммерческие Предложения</h1>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Создать ТКП
        </Button>
      </div>

      {/* Фильтры */}
      <div className="bg-white p-4 rounded-lg border space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              className="w-full px-3 py-2 border rounded-md"
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
            <Label>Компания</Label>
            <select
              className="w-full px-3 py-2 border rounded-md"
              value={legalEntityFilter}
              onChange={(e) => setLegalEntityFilter(e.target.value)}
            >
              <option value="">Все компании</option>
              {legalEntities?.results?.map((entity) => (
                <option key={entity.id} value={entity.id}>{entity.name}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>Статус</Label>
            <select
              className="w-full px-3 py-2 border rounded-md"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Все статусы</option>
              <option value="draft">Черновик</option>
              <option value="in_progress">В работе</option>
              <option value="checking">На проверке</option>
              <option value="approved">Утверждено</option>
              <option value="sent">Отправлено</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setObjectFilter('');
              setLegalEntityFilter('');
              setStatusFilter('');
            }}
          >
            Сбросить фильтры
          </Button>
        </div>
      </div>

      {/* Таблица */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Номер</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Исх. номер</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Название</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Объект</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Компания</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Сумма</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Версия</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    Загрузка...
                  </td>
                </tr>
              ) : tkpList.length > 0 ? (
                tkpList.map((tkp) => (
                  <tr key={tkp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/proposals/technical-proposals/${tkp.id}`)}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {tkp.number}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {tkp.outgoing_number || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-xs truncate">{tkp.name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(tkp.date)}</td>
                    <td className="px-4 py-3">
                      <div className="max-w-xs truncate text-gray-600">{tkp.object_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-xs truncate text-gray-600">{tkp.legal_entity_name}</div>
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(tkp.status)}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(tkp.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {tkp.parent_version && (
                          <FileText className="w-3 h-3 text-gray-400" />
                        )}
                        <span className="text-sm text-gray-600">v{tkp.version_number}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/proposals/technical-proposals/${tkp.id}`)}
                          title="Открыть"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCreateVersion(tkp.id, tkp.version_number)}
                          title="Создать версию"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(tkp.id, tkp.name)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
        {tkpData && tkpData.count > 0 && (
          <div className="px-4 py-3 border-t bg-gray-50">
            <div className="text-sm text-gray-600">
              Всего: {tkpData.count} ТКП
            </div>
          </div>
        )}
      </div>

      {/* Диалог создания */}
      <CreateTechnicalProposalDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  );
}