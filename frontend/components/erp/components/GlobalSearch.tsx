import { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useNavigate } from 'react-router';
import { Input } from './ui/input';
import { formatDate, formatAmount, formatCurrency } from '../lib/utils';
import { CONSTANTS } from '../constants';

export function GlobalSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);

  // Поиск по контрагентам
  const { data: counterparties, isLoading: loadingCounterparties } = useQuery({
    queryKey: ['search-counterparties', searchQuery],
    queryFn: () => api.getCounterparties({ search: searchQuery }),
    enabled: searchQuery.length >= 2,
    retry: false,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Поиск по договорам
  const { data: contracts, isLoading: loadingContracts } = useQuery({
    queryKey: ['search-contracts', searchQuery],
    queryFn: () => api.getContracts({ search: searchQuery, page_size: 10 }),
    enabled: searchQuery.length >= 2,
    retry: false,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Поиск по объектам
  const { data: objects, isLoading: loadingObjects } = useQuery({
    queryKey: ['search-objects', searchQuery],
    queryFn: () => api.getConstructionObjects({ search: searchQuery }),
    enabled: searchQuery.length >= 2,
    retry: false,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Поиск по платежам
  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: ['search-payments', searchQuery],
    queryFn: () => api.getPayments({ search: searchQuery, page_size: 10 }),
    enabled: searchQuery.length >= 2,
    retry: false,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const isLoading = loadingCounterparties || loadingContracts || loadingObjects || loadingPayments;

  const hasResults = 
    (counterparties && counterparties.length > 0) ||
    (contracts?.results && contracts.results.length > 0) ||
    (objects && objects.length > 0) ||
    (payments?.results && payments.results.length > 0);

  // Закрытие при клике вне компонента
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNavigate = (path: string) => {
    navigate(path);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div ref={searchRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          type="text"
          placeholder="Поиск..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          className="pl-10 pr-4"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
        )}
      </div>

      {/* Dropdown с результатами */}
      {isOpen && searchQuery.length >= 2 && (
        <div className="absolute top-full mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Поиск...
            </div>
          ) : !hasResults ? (
            <div className="p-4 text-center text-gray-500">
              Ничего не найдено
            </div>
          ) : (
            <div className="py-2">
              {/* Контрагенты */}
              {counterparties && counterparties.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs text-gray-500 uppercase tracking-wide">
                    Контрагенты
                  </div>
                  {counterparties.slice(0, 5).map((item: any) => (
                    <button
                      key={`counterparty-${item.id}`}
                      onClick={() => handleNavigate('/counterparties')}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="text-sm text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.inn || 'Без ИНН'}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* Договоры */}
              {contracts?.results && contracts.results.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs text-gray-500 uppercase tracking-wide">
                    Договоры
                  </div>
                  {contracts.results.slice(0, 5).map((item: any) => (
                    <button
                      key={`contract-${item.id}`}
                      onClick={() => handleNavigate(`/contracts/${item.id}`)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="text-sm text-gray-900">{item.contract_number}</div>
                      <div className="text-xs text-gray-500">
                        {item.counterparty_display || 'Без контрагента'}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Объекты */}
              {objects && objects.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs text-gray-500 uppercase tracking-wide">
                    Объекты
                  </div>
                  {objects.slice(0, 5).map((item: any) => (
                    <button
                      key={`object-${item.id}`}
                      onClick={() => handleNavigate(`/objects/${item.id}`)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="text-sm text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.address || 'Без адреса'}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* Платежи */}
              {payments?.results && payments.results.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs text-gray-500 uppercase tracking-wide">
                    Платежи
                  </div>
                  {payments.results.slice(0, 5).map((item: any) => (
                    <button
                      key={`payment-${item.id}`}
                      onClick={() => handleNavigate('/payments')}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="text-sm text-gray-900">
                        {item.contract_display || `Платеж #${item.id}`}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDate(item.payment_date)} • {formatAmount(item.amount)} ₽
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}