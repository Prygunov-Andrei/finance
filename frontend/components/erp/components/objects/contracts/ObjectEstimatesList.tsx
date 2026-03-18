import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Download } from 'lucide-react';
import { api, ContractEstimateListItem, ContractListItem } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '../../common/EmptyState';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { formatDate, formatCurrency } from '@/lib/utils';
import { CONSTANTS } from '../../../constants';

type ObjectEstimatesListProps = {
  objectId: number;
  contractType: 'income' | 'expense';
};

const ESTIMATE_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: 'Черновик', className: 'bg-gray-100 text-gray-800' },
  agreed: { label: 'Согласована', className: 'bg-yellow-100 text-yellow-800' },
  signed: { label: 'Подписана', className: 'bg-green-100 text-green-800' },
};

export const ObjectEstimatesList = ({ objectId, contractType }: ObjectEstimatesListProps) => {
  const { data: contractsData, isLoading: contractsLoading } = useQuery({
    queryKey: ['contracts', { object: objectId, contract_type: contractType }],
    queryFn: () => api.getContracts({ object: objectId, contract_type: contractType }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const contracts: ContractListItem[] = contractsData?.results || [];
  const contractIds = contracts.map((c) => c.id);

  const { data: allEstimates, isLoading: estimatesLoading } = useQuery({
    queryKey: ['contract-estimates-by-object', objectId, contractType],
    queryFn: async () => {
      if (contractIds.length === 0) return [];
      const results = await Promise.all(
        contractIds.map((cid) => api.getContractEstimates(cid))
      );
      return results.flat();
    },
    enabled: contractIds.length > 0,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  if (contractsLoading || estimatesLoading) {
    return <LoadingSpinner text="Загрузка смет..." />;
  }

  const estimates = allEstimates || [];

  if (estimates.length === 0) {
    return (
      <EmptyState
        icon={<FileSpreadsheet className="w-12 h-12 text-gray-400" />}
        title={contractType === 'income' ? 'Нет смет Заказчика' : 'Нет монтажных смет'}
        description="Сметы к договорам ещё не созданы"
      />
    );
  }

  const contractMap = new Map(contracts.map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          {contractType === 'income' ? 'Сметы Заказчика' : 'Монтажные сметы'}
        </h3>
        <span className="text-sm text-gray-500">{estimates.length} шт.</span>
      </div>

      <div className="space-y-3">
        {estimates.map((est) => {
          const statusCfg = ESTIMATE_STATUS_CONFIG[est.status] || ESTIMATE_STATUS_CONFIG.draft;
          const contract = contractMap.get(est.contract);
          return (
            <div
              key={est.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <FileSpreadsheet className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="font-medium text-gray-900 truncate">
                      {est.number} — {est.name}
                    </span>
                    <Badge className={statusCfg.className}>{statusCfg.label}</Badge>
                    {est.version_number > 1 && (
                      <Badge className="bg-purple-100 text-purple-800">
                        v{est.version_number}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    {contract && <span>Договор: {contract.number}</span>}
                    {est.signed_date && <span>Подписана: {formatDate(est.signed_date)}</span>}
                  </div>
                  {est.notes && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{est.notes}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {est.file && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(est.file!, '_blank');
                      }}
                      aria-label="Скачать файл сметы"
                      tabIndex={0}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
