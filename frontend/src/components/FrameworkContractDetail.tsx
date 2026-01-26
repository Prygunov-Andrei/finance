import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  FileText,
  Calendar,
  Building2,
  User,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
  Download,
  X,
} from 'lucide-react';
import { api, FrameworkContractDetail as FCDetail } from '../lib/api';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { toast } from 'sonner';
import { formatDate, formatAmount, formatCurrency } from '../lib/utils';
import { CONSTANTS } from '../constants';

type TabType = 'info' | 'price-lists' | 'contracts';

export function FrameworkContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('info');

  // Загрузка рамочного договора
  const { data: frameworkContract, isLoading } = useQuery({
    queryKey: ['framework-contract', id],
    queryFn: () => api.getFrameworkContract(parseInt(id!)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Загрузка договоров под этот рамочный
  const { data: contracts } = useQuery({
    queryKey: ['framework-contract-contracts', id],
    queryFn: () => api.getFrameworkContractContracts(parseInt(id!)),
    enabled: !!id && activeTab === 'contracts',
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Удаление рамочного договора
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteFrameworkContract(parseInt(id!)),
    onSuccess: () => {
      toast.success('Рамочный договор удалён');
      navigate('/contracts/framework-contracts');
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || error.message || 'Ошибка удаления';
      toast.error(errorMessage);
    },
  });

  // Активация договора
  const activateMutation = useMutation({
    mutationFn: () => api.activateFrameworkContract(parseInt(id!)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['framework-contract', id] });
      toast.success('Рамочный договор активирован');
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || error.message;
      toast.error(errorMessage);
    },
  });

  // Расторжение договора
  const terminateMutation = useMutation({
    mutationFn: () => api.terminateFrameworkContract(parseInt(id!)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['framework-contract', id] });
      toast.success('Рамочный договор расторгнут');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleDelete = () => {
    if (frameworkContract && confirm(`Вы уверены, что хотите удалить рамочный договор "${frameworkContract.name}"?`)) {
      deleteMutation.mutate();
    }
  };

  const handleActivate = () => {
    if (confirm('Активировать рамочный договор?')) {
      activateMutation.mutate();
    }
  };

  const handleTerminate = () => {
    if (confirm('Расторгнуть рамочный договор? Это действие нельзя отменить.')) {
      terminateMutation.mutate();
    }
  };

  const getStatusBadge = (status: string, isActive: boolean) => {
    if (isActive) {
      return <Badge className="bg-green-100 text-green-800">Действующий</Badge>;
    }

    const statusConfig = {
      draft: { label: 'Черновик', className: 'bg-gray-100 text-gray-800' },
      active: { label: 'Активный', className: 'bg-blue-100 text-blue-800' },
      expired: { label: 'Истёк срок', className: 'bg-red-100 text-red-800' },
      terminated: { label: 'Расторгнут', className: 'bg-orange-100 text-orange-800' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    );
  }

  if (!frameworkContract) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle className="w-12 h-12 text-gray-400 mb-4" />
        <div className="text-gray-500">Рамочный договор не найден</div>
        <Button onClick={() => navigate('/contracts/framework-contracts')} className="mt-4">
          Вернуться к списку
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Хедер */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-4">
            <Button
              onClick={() => navigate('/contracts/framework-contracts')}
              className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-gray-900">{frameworkContract.name}</h1>
                {getStatusBadge(frameworkContract.status, frameworkContract.is_active)}
              </div>
              <div className="flex items-center gap-4 text-gray-600">
                <span>№ {frameworkContract.number}</span>
                <span>от {formatDate(frameworkContract.date)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {frameworkContract.status === 'draft' && (
              <Button
                onClick={handleActivate}
                className="bg-green-600 text-white hover:bg-green-700"
                disabled={activateMutation.isPending}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Активировать
              </Button>
            )}
            {frameworkContract.status === 'active' && (
              <Button
                onClick={handleTerminate}
                className="bg-orange-600 text-white hover:bg-orange-700"
                disabled={terminateMutation.isPending}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Расторгнуть
              </Button>
            )}
            <Button
              onClick={() => navigate(`/contracts/framework-contracts/${id}/edit`)}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Редактировать
            </Button>
            <Button
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Предупреждения */}
        {frameworkContract.is_expired && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-900">Срок действия договора истёк</span>
          </div>
        )}

        {!frameworkContract.is_active && frameworkContract.status === 'active' && (
          <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-600" />
            <span className="text-orange-900">
              {frameworkContract.days_until_expiration < 0
                ? 'Срок действия истёк'
                : 'Договор ещё не вступил в силу'}
            </span>
          </div>
        )}

        {frameworkContract.days_until_expiration > 0 && frameworkContract.days_until_expiration <= 30 && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <span className="text-yellow-900">
              До истечения срока действия осталось {frameworkContract.days_until_expiration} дн.
            </span>
          </div>
        )}

        {/* Вкладки */}
        <div className="flex gap-1 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('info')}
            className={`px-4 py-2 -mb-px transition-colors ${
              activeTab === 'info'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Основная информация
          </button>
          <button
            onClick={() => setActiveTab('price-lists')}
            className={`px-4 py-2 -mb-px transition-colors ${
              activeTab === 'price-lists'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Прайс-листы ({frameworkContract.price_lists?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('contracts')}
            className={`px-4 py-2 -mb-px transition-colors ${
              activeTab === 'contracts'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Договоры ({frameworkContract.contracts_count})
          </button>
        </div>
      </div>

      {/* Контент вкладок */}
      {activeTab === 'info' && <InfoTab frameworkContract={frameworkContract} />}
      {activeTab === 'price-lists' && <PriceListsTab frameworkContract={frameworkContract} />}
      {activeTab === 'contracts' && <ContractsTab contracts={contracts || []} />}
    </div>
  );
}

// Вкладка "Основная информация"
function InfoTab({ frameworkContract }: { frameworkContract: FCDetail }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Основная информация */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          Основная информация
        </h2>
        <div className="space-y-4">
          <div>
            <Label className="text-gray-600">Исполнитель</Label>
            <div className="mt-1 flex items-start gap-2">
              <Building2 className="w-4 h-4 text-gray-400 mt-1" />
              <div className="text-gray-900">{frameworkContract.counterparty_name}</div>
            </div>
          </div>

          <div>
            <Label className="text-gray-600">Наша компания</Label>
            <div className="mt-1 text-gray-900">{frameworkContract.legal_entity_name}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-600">Дата заключения</Label>
              <div className="mt-1 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-gray-900">{formatDate(frameworkContract.date)}</span>
              </div>
            </div>

            <div>
              <Label className="text-gray-600">Создал</Label>
              <div className="mt-1 flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-gray-900">{frameworkContract.created_by_name}</span>
              </div>
            </div>
          </div>

          {frameworkContract.notes && (
            <div>
              <Label className="text-gray-600">Примечания</Label>
              <div className="mt-1 text-gray-900 whitespace-pre-wrap">{frameworkContract.notes}</div>
            </div>
          )}

          {frameworkContract.file && (
            <div>
              <Label className="text-gray-600">Файл договора</Label>
              <a
                href={frameworkContract.file}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center gap-2 text-blue-600 hover:text-blue-700"
              >
                <Download className="w-4 h-4" />
                Скачать файл
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Срок действия и статистика */}
      <div className="space-y-6">
        {/* Срок действия */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-green-600" />
            Срок действия
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Начало:</span>
              <span className="text-gray-900">{formatDate(frameworkContract.valid_from)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Окончание:</span>
              <span className="text-gray-900">{formatDate(frameworkContract.valid_until)}</span>
            </div>
            {frameworkContract.days_until_expiration > 0 && (
              <div className="pt-3 border-t border-gray-200">
                <div className="flex justify-between">
                  <span className="text-gray-600">Дней до окончания:</span>
                  <span className={`font-medium ${
                    frameworkContract.days_until_expiration <= 30 ? 'text-orange-600' : 'text-gray-900'
                  }`}>
                    {frameworkContract.days_until_expiration}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Статистика */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-gray-900 mb-4">Статистика</h2>
          <div className="space-y-3">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-gray-600 mb-1">Количество договоров</div>
              <div className="text-blue-900">{frameworkContract.contracts_count}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-gray-600 mb-1">бщая сумма договоров</div>
              <div className="text-green-900">{formatCurrency(frameworkContract.total_contracts_amount)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Вкладка "Прайс-листы"
function PriceListsTab({ frameworkContract }: { frameworkContract: FCDetail }) {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedPriceLists, setSelectedPriceLists] = useState<number[]>([]);

  // Загрузка всех прайс-листов
  const { data: allPriceLists } = useQuery({
    queryKey: ['price-lists'],
    queryFn: () => api.getPriceLists(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Добавление прайс-листов
  const addPriceListsMutation = useMutation({
    mutationFn: (priceListIds: number[]) =>
      api.addPriceListsToFrameworkContract(frameworkContract.id, priceListIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['framework-contract', frameworkContract.id.toString()] });
      toast.success('Прайс-листы добавлены');
      setIsAddDialogOpen(false);
      setSelectedPriceLists([]);
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  // Удаление прайс-листа
  const removePriceListMutation = useMutation({
    mutationFn: (priceListIds: number[]) =>
      api.removePriceListsFromFrameworkContract(frameworkContract.id, priceListIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['framework-contract', frameworkContract.id.toString()] });
      toast.success('Прайс-лист удалён');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleAddPriceLists = () => {
    if (selectedPriceLists.length === 0) {
      toast.error('Выберите хотя бы один прайс-лист');
      return;
    }
    addPriceListsMutation.mutate(selectedPriceLists);
  };

  const handleRemovePriceList = (priceListId: number, priceListName: string) => {
    if (confirm(`Удалить прайс-лист "${priceListName}" из договора?`)) {
      removePriceListMutation.mutate([priceListId]);
    }
  };

  // Фильтруем доступные для добавления прайс-листы
  const availablePriceLists = allPriceLists?.results?.filter(
    (pl: any) => !frameworkContract.price_lists.includes(pl.id)
  ) || [];

  if (!frameworkContract.price_lists_details || frameworkContract.price_lists_details.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
        <div className="text-center text-gray-500">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="mb-4">Прайс-листы не добавлены</p>
          <Button
            onClick={() => setIsAddDialogOpen(true)}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Добавить прайс-листы
          </Button>
        </div>

        {/* Диалог добавления прайс-листов */}
        {isAddDialogOpen && (
          <AddPriceListsDialog
            open={isAddDialogOpen}
            onClose={() => setIsAddDialogOpen(false)}
            availablePriceLists={availablePriceLists}
            selectedPriceLists={selectedPriceLists}
            setSelectedPriceLists={setSelectedPriceLists}
            onAdd={handleAddPriceLists}
            isPending={addPriceListsMutation.isPending}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-gray-900">Согласованные прайс-листы</h2>
          <Button
            onClick={() => setIsAddDialogOpen(true)}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Добавить
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {frameworkContract.price_lists_details.map((priceList: any) => (
            <div
              key={priceList.id}
              className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-gray-900">{priceList.name}</h3>
                  <p className="text-gray-600 mt-1">
                    Версия: {priceList.version_number || 1}
                  </p>
                </div>
                <Button
                  onClick={() => handleRemovePriceList(priceList.id, priceList.name)}
                  className="bg-red-100 text-red-700 hover:bg-red-200 px-2 py-1"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Диалог добавления прайс-листов */}
      {isAddDialogOpen && (
        <AddPriceListsDialog
          open={isAddDialogOpen}
          onClose={() => setIsAddDialogOpen(false)}
          availablePriceLists={availablePriceLists}
          selectedPriceLists={selectedPriceLists}
          setSelectedPriceLists={setSelectedPriceLists}
          onAdd={handleAddPriceLists}
          isPending={addPriceListsMutation.isPending}
        />
      )}
    </div>
  );
}

// Вкладка "Договоры"
function ContractsTab({ contracts }: { contracts: any[] }) {
  const navigate = useNavigate();

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      planned: { label: 'Запланирован', className: 'bg-gray-100 text-gray-800' },
      active: { label: 'В работе', className: 'bg-blue-100 text-blue-800' },
      completed: { label: 'Завершён', className: 'bg-green-100 text-green-800' },
      terminated: { label: 'Расторгнут', className: 'bg-red-100 text-red-800' },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.planned;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (contracts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
        <div className="text-center text-gray-500">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p>Договоры под этот рамочный договор не созданы</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-gray-900 mb-4">Договоры ({contracts.length})</h2>
      <div className="space-y-3">
        {contracts.map((contract) => (
          <div
            key={contract.id}
            onClick={() => navigate(`/contracts/${contract.id}`)}
            className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-gray-900">{contract.name}</h3>
                  {getStatusBadge(contract.status)}
                </div>
                <div className="flex items-center gap-4 text-gray-600">
                  <span>№ {contract.number}</span>
                  <span>{formatDate(contract.contract_date)}</span>
                  <span>{contract.object_name}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-gray-600">Сумма</div>
                <div className="text-gray-900">{formatCurrency(contract.total_amount)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Диалог добавления прайс-листов
function AddPriceListsDialog({
  open,
  onClose,
  availablePriceLists,
  selectedPriceLists,
  setSelectedPriceLists,
  onAdd,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  availablePriceLists: any[];
  selectedPriceLists: number[];
  setSelectedPriceLists: (ids: number[]) => void;
  onAdd: () => void;
  isPending: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-gray-900">Добавить прайс-листы</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto max-h-96">
          {availablePriceLists.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              Нет доступных прайс-листов для добавления
            </div>
          ) : (
            <div className="space-y-2">
              {availablePriceLists.map((priceList) => (
                <label
                  key={priceList.id}
                  className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedPriceLists.includes(priceList.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPriceLists([...selectedPriceLists, priceList.id]);
                      } else {
                        setSelectedPriceLists(selectedPriceLists.filter((id) => id !== priceList.id));
                      }
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="text-gray-900">{priceList.name}</div>
                    <div className="text-gray-500">Версия: {priceList.version_number || 1}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="p-6 border-t border-gray-200 flex justify-end gap-2">
          <Button onClick={onClose} className="bg-gray-100 text-gray-700 hover:bg-gray-200">
            Отмена
          </Button>
          <Button
            onClick={onAdd}
            disabled={selectedPriceLists.length === 0 || isPending}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            Добавить ({selectedPriceLists.length})
          </Button>
        </div>
      </div>
    </div>
  );
}