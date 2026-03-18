import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge } from './ui/badge';
import { CONSTANTS } from '../constants';

interface NotificationBadgeProps {
  type: 'expiring-contracts' | 'unpaid-acts' | 'unchecked-projects';
}

// Общая функция для получения истекающих договоров
async function fetchExpiringContracts() {
  const now = new Date();
  const thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(now.getDate() + 30);
  
  const contracts = await api.getContracts({ status: 'active', page_size: 100 });
  
  if (contracts.results) {
    return contracts.results.filter((contract: any) => {
      if (!contract.end_date) return false;
      const endDate = new Date(contract.end_date);
      return endDate >= now && endDate <= thirtyDaysLater;
    });
  }
  return [];
}

export function NotificationBadge({ type }: NotificationBadgeProps) {
  // Истекающие договоры
  const { data: expiringContracts } = useQuery({
    queryKey: ['notification-expiring-contracts'],
    queryFn: fetchExpiringContracts,
    enabled: type === 'expiring-contracts',
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
    refetchInterval: 5 * 60 * 1000, // Обновляем каждые 5 минут
    retry: false,
  });

  const getCount = () => {
    switch (type) {
      case 'expiring-contracts':
        return expiringContracts?.length || 0;
      case 'unpaid-acts':
        // TODO: Реализовать когда будет доступен API актов
        return 0;
      case 'unchecked-projects':
        // TODO: Реализовать когда будет доступен API проектов
        return 0;
      default:
        return 0;
    }
  };

  const count = getCount();

  if (count === 0) return null;

  return (
    <Badge variant="destructive" className="ml-2 h-5 min-w-5 px-1.5">
      {count}
    </Badge>
  );
}

// Хук для использования в любом компоненте
export function useNotifications() {
  const { data: expiringContracts } = useQuery({
    queryKey: ['notification-expiring-contracts'],
    queryFn: fetchExpiringContracts,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });

  return {
    expiringContractsCount: expiringContracts?.length || 0,
    unpaidActsCount: 0, // TODO: Реализовать
    uncheckedProjectsCount: 0, // TODO: Реализовать
    totalCount: (expiringContracts?.length || 0),
  };
}