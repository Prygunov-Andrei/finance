import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@/hooks/erp-router';
import { ClipboardList } from 'lucide-react';
import { api, Act, ContractListItem } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '../../common/EmptyState';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { formatDate, formatCurrency } from '@/lib/utils';
import { CONSTANTS } from '../../../constants';

type ObjectActsListProps = {
  objectId: number;
  contractType: 'income' | 'expense';
};

const ACT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: 'Черновик', className: 'bg-gray-100 text-gray-800' },
  agreed: { label: 'Согласован', className: 'bg-yellow-100 text-yellow-800' },
  signed: { label: 'Подписан', className: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Отменен', className: 'bg-red-100 text-red-800' },
};

const ACT_TYPE_CONFIG: Record<string, string> = {
  ks2: 'КС-2',
  ks3: 'КС-3',
  simple: 'Простой',
};

export const ObjectActsList = ({ objectId, contractType }: ObjectActsListProps) => {
  const navigate = useNavigate();

  const { data: contractsData, isLoading: contractsLoading } = useQuery({
    queryKey: ['contracts', { object: objectId, contract_type: contractType }],
    queryFn: () => api.getContracts({ object: objectId, contract_type: contractType }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const contracts: ContractListItem[] = contractsData?.results || [];
  const contractIds = contracts.map((c) => c.id);

  const { data: allActs, isLoading: actsLoading } = useQuery({
    queryKey: ['acts-by-object', objectId, contractType],
    queryFn: async () => {
      if (contractIds.length === 0) return [];
      const results = await Promise.all(
        contractIds.map((cid) => api.getActs(cid))
      );
      return results.flat();
    },
    enabled: contractIds.length > 0,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  if (contractsLoading || actsLoading) {
    return <LoadingSpinner text="Загрузка актов..." />;
  }

  const acts = allActs || [];

  if (acts.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList className="w-12 h-12 text-gray-400" />}
        title="Нет актов"
        description="Акты выполненных работ ещё не созданы"
      />
    );
  }

  const contractMap = new Map(contracts.map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Акты выполненных работ</h3>
        <span className="text-sm text-gray-500">{acts.length} шт.</span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Номер</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Тип</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Договор</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Сумма</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {acts.map((act) => {
                const statusCfg = ACT_STATUS_CONFIG[act.status] || ACT_STATUS_CONFIG.draft;
                const contract = contractMap.get(act.contract);
                return (
                  <tr
                    key={act.id}
                    onClick={() => navigate(`/contracts/acts/${act.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{act.number}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {ACT_TYPE_CONFIG[act.act_type] || act.act_type}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {contract?.number || act.contract_number || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(act.date)}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                      {formatCurrency(act.amount_gross)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={statusCfg.className}>{statusCfg.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
