import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import type { SupplyRequest, SupplyRequestStatus } from '../../types/supply';
import {
  Loader2, Search, Filter, X, ShoppingCart, Eye,
  ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, Clock, Zap,
} from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { formatDate } from '../../lib/utils';
import { CONSTANTS } from '../../constants';

const STATUS_LABELS: Record<SupplyRequestStatus, string> = {
  received: 'Получен',
  processing: 'Обработка',
  completed: 'Завершён',
  error: 'Ошибка',
};

const STATUS_ICONS: Record<SupplyRequestStatus, React.ReactNode> = {
  received: <Clock className="w-3.5 h-3.5" />,
  processing: <Zap className="w-3.5 h-3.5" />,
  completed: <CheckCircle className="w-3.5 h-3.5" />,
  error: <AlertTriangle className="w-3.5 h-3.5" />,
};

const STATUS_COLORS: Record<SupplyRequestStatus, string> = {
  received: 'bg-blue-100 text-blue-800',
  processing: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-800',
};

export function SupplyRequestsPage() {
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery]);

  const buildParams = (): string => {
    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('page_size', String(pageSize));
    if (searchQuery) params.set('search', searchQuery);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    return params.toString();
  };

  const { data: response, isLoading } = useQuery({
    queryKey: ['supply-requests', statusFilter, searchQuery, currentPage, pageSize],
    queryFn: () => (api as any).getSupplyRequests(buildParams()),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const requests: SupplyRequest[] = response?.results || [];
  const totalCount = response?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Запросы из Битрикс24</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Автоматически полученные запросы на снабжение. Всего: {totalCount}
        </p>
      </div>

      {/* Search & Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по названию, объекту..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 mr-2" />
            Фильтры
          </Button>
          {(statusFilter !== 'all' || searchQuery) && (
            <Button variant="ghost" size="sm" onClick={() => { setStatusFilter('all'); setSearchQuery(''); }}>
              <X className="w-4 h-4 mr-2" />
              Сбросить
            </Button>
          )}
        </div>
        {showFilters && (
          <div className="mt-4 pt-4 border-t">
            <div className="w-48">
              <Label className="text-xs">Статус</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : requests.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">Запросы не найдены</p>
          <p className="text-sm mt-1">Запросы появятся автоматически при поступлении из Битрикс24</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">ID Битрикс</th>
                  <th className="text-left p-3 font-medium">Заголовок</th>
                  <th className="text-left p-3 font-medium">Объект</th>
                  <th className="text-left p-3 font-medium">Договор</th>
                  <th className="text-left p-3 font-medium">Оператор</th>
                  <th className="text-left p-3 font-medium">Статус</th>
                  <th className="text-left p-3 font-medium">Счетов</th>
                  <th className="text-left p-3 font-medium">Дата</th>
                  <th className="text-center p-3 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-mono text-xs">{req.bitrix_deal_id}</td>
                    <td className="p-3 max-w-[250px] truncate font-medium">
                      {req.bitrix_deal_title}
                    </td>
                    <td className="p-3">
                      {req.object_name || (
                        <span className="text-amber-600 text-xs flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Не определён
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {req.contract_number || (
                        <span className="text-amber-600 text-xs flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Не определён
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {req.operator_name || '—'}
                    </td>
                    <td className="p-3">
                      <Badge className={`${STATUS_COLORS[req.status]} text-xs flex items-center gap-1 w-fit`}>
                        {STATUS_ICONS[req.status]}
                        {STATUS_LABELS[req.status]}
                      </Badge>
                      {Object.keys(req.mapping_errors || {}).length > 0 && (
                        <div className="mt-1">
                          {Object.values(req.mapping_errors).map((err, i) => (
                            <p key={i} className="text-xs text-red-500">{err}</p>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" className="text-xs">
                        {req.invoices_count}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(req.created_at)}
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Просмотр"
                        tabIndex={0}
                        onClick={() => {/* TODO: navigate to detail when detail page exists */}}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Показано {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalCount)} из {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
