import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Plus, Search, Filter, X, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { formatDate, formatAmount, formatCurrency } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { useCounterparties, useLegalEntities } from '../../hooks';

export function FrameworkContractsList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [showFilters, setShowFilters] = useState(false);

  // Загрузка рамочных договоров
  const { data: contractsData, isLoading } = useQuery({
    queryKey: ['framework-contracts', { ...filters, search }],
    queryFn: () => api.getFrameworkContracts({ ...filters, search }),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Загрузка справочников для фильтров с кешированием
  const { data: counterpartiesData } = useCounterparties();
  const { data: legalEntitiesData } = useLegalEntities();

  // Извлекаем массивы из ответов API
  const counterparties = counterpartiesData?.results || counterpartiesData || [];
  const legalEntities = legalEntitiesData?.results || legalEntitiesData || [];

  const getStatusBadge = (status: string, isActive: boolean) => {
    if (status === 'draft') {
      return <Badge className="bg-gray-100 text-gray-800">Черновик</Badge>;
    } else if (status === 'active') {
      return isActive ? (
        <Badge className="bg-green-100 text-green-800">Действующий</Badge>
      ) : (
        <Badge className="bg-blue-100 text-blue-800">Неактивный</Badge>
      );
    } else if (status === 'expired') {
      return <Badge className="bg-orange-100 text-orange-800">Истёк срок</Badge>;
    } else if (status === 'terminated') {
      return <Badge className="bg-red-100 text-red-800">Расторгнут</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>;
  };

  const handleResetFilters = () => {
    setFilters({});
    setSearch('');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    );
  }

  const contracts = contractsData?.results || [];

  return (
    <div className="space-y-6">
      {/* Хедер */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gray-900">Рамочные договоры</h1>
          <p className="text-gray-600">Управление рамочными договорами с поставщиками</p>
        </div>
        <Button
          onClick={() => navigate('/contracts/framework-contracts/create')}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Создать рамочный договор
        </Button>
      </div>

      {/* Поиск и фильтры */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder="Поиск по номеру и названию..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? 'bg-blue-50' : ''}
          >
            <Filter className="w-4 h-4 mr-2" />
            Фильтры
          </Button>
          {(Object.keys(filters).length > 0 || search) && (
            <Button variant="outline" onClick={handleResetFilters}>
              <X className="w-4 h-4 mr-2" />
              Сбросить
            </Button>
          )}
        </div>

        {/* Панель фильтров */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
            <div>
              <Label>Статус</Label>
              <select
                value={filters.status || ''}
                onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
                className="w-full px-3 py-2 border rounded-md mt-1"
              >
                <option value="">Все</option>
                <option value="draft">Черновик</option>
                <option value="active">Действующий</option>
                <option value="expired">Истёк срок</option>
                <option value="terminated">Расторгнут</option>
              </select>
            </div>
            <div>
              <Label>Исполнитель</Label>
              <select
                value={filters.counterparty || ''}
                onChange={(e) => setFilters({ ...filters, counterparty: e.target.value || undefined })}
                className="w-full px-3 py-2 border rounded-md mt-1"
              >
                <option value="">Все исполнители</option>
                {counterparties.map((cp) => (
                  <option key={cp.id} value={cp.id}>{cp.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Наша компания</Label>
              <select
                value={filters.legal_entity || ''}
                onChange={(e) => setFilters({ ...filters, legal_entity: e.target.value || undefined })}
                className="w-full px-3 py-2 border rounded-md mt-1"
              >
                <option value="">Все компании</option>
                {legalEntities.map((le) => (
                  <option key={le.id} value={le.id}>{le.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Таблица рамочных договоров */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {contracts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Рамочные договоры не найдены
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-gray-600">Номер</th>
                  <th className="px-6 py-3 text-left text-gray-600">Название</th>
                  <th className="px-6 py-3 text-left text-gray-600">Исполнитель</th>
                  <th className="px-6 py-3 text-left text-gray-600">Компания</th>
                  <th className="px-6 py-3 text-left text-gray-600">Дата заключения</th>
                  <th className="px-6 py-3 text-left text-gray-600">Срок действия</th>
                  <th className="px-6 py-3 text-left text-gray-600">Статус</th>
                  <th className="px-6 py-3 text-left text-gray-600">Активен</th>
                  <th className="px-6 py-3 text-left text-gray-600">Договоров</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {contracts.map((contract) => (
                  <tr
                    key={contract.id}
                    onClick={() => navigate(`/contracts/framework-contracts/${contract.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-gray-900">{contract.number}</td>
                    <td className="px-6 py-4 text-gray-900">{contract.name}</td>
                    <td className="px-6 py-4 text-gray-600">{contract.counterparty_name}</td>
                    <td className="px-6 py-4 text-gray-600">{contract.legal_entity_name}</td>
                    <td className="px-6 py-4 text-gray-600">{formatDate(contract.date)}</td>
                    <td className="px-6 py-4 text-gray-600">
                      {formatDate(contract.valid_from)} - {formatDate(contract.valid_until)}
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(contract.status, contract.is_active)}</td>
                    <td className="px-6 py-4">
                      {contract.is_active ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-gray-400" />
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-900">
                        {contract.contracts_count}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Счетчик */}
      <div className="text-gray-600">
        Всего рамочных договоров: {contractsData?.count || 0}
      </div>
    </div>
  );
}