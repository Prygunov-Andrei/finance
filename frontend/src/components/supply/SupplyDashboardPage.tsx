import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { DashboardData } from '../../types/supply';
import {
  Loader2, Wallet, AlertTriangle, CalendarDays, TrendingDown,
  Building2, Layers, BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { formatAmount } from '../../lib/utils';
import { CONSTANTS } from '../../constants';

export function SupplyDashboardPage() {
  const { data: dashboard, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['invoice-dashboard'],
    queryFn: () => (api as any).getInvoiceDashboard(),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-lg font-medium">Не удалось загрузить дашборд</p>
      </div>
    );
  }

  const { account_balances, registry_summary, by_object, by_category } = dashboard;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Дашборд снабжения</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Финансовый обзор для управления кредиторской задолженностью
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Всего в реестре"
          value={formatAmount(registry_summary.total_amount)}
          subtitle={`${registry_summary.total_count} счетов`}
          icon={<Wallet className="w-5 h-5 text-blue-600" />}
          color="blue"
        />
        <SummaryCard
          title="Просрочено"
          value={formatAmount(registry_summary.overdue_amount)}
          subtitle={`${registry_summary.overdue_count} счетов`}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          color="red"
        />
        <SummaryCard
          title="Сегодня"
          value={formatAmount(registry_summary.today_amount)}
          subtitle={`${registry_summary.today_count} счетов`}
          icon={<CalendarDays className="w-5 h-5 text-amber-600" />}
          color="amber"
        />
        <SummaryCard
          title="Эта неделя"
          value={formatAmount(registry_summary.this_week_amount)}
          subtitle={`${registry_summary.this_week_count} счетов`}
          icon={<TrendingDown className="w-5 h-5 text-purple-600" />}
          color="purple"
        />
      </div>

      {/* Month summary */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">За текущий месяц</span>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {registry_summary.this_month_count} счетов
              </span>
              <span className="text-lg font-bold">
                {formatAmount(registry_summary.this_month_amount)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Balances */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Остатки на счетах
          </CardTitle>
        </CardHeader>
        <CardContent>
          {account_balances.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Нет данных</p>
          ) : (
            <div className="space-y-3">
              {account_balances.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm">{acc.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{acc.number}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">
                      {formatAmount(acc.internal_balance)} {acc.currency}
                    </p>
                    {acc.bank_balance !== null && (
                      <p className="text-xs text-muted-foreground">
                        Банк: {formatAmount(acc.bank_balance)}
                        {acc.bank_balance_date && (
                          <span className="ml-1">({acc.bank_balance_date})</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* By Object & By Category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Object */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              По объектам
            </CardTitle>
          </CardHeader>
          <CardContent>
            {by_object.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Нет данных</p>
            ) : (
              <div className="space-y-2">
                {by_object.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <span className="text-sm truncate max-w-[200px]">
                      {item.object__name || 'Без объекта'}
                    </span>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">{item.count}</Badge>
                      <span className="font-medium text-sm whitespace-nowrap">
                        {formatAmount(item.total)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* By Category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="w-5 h-5" />
              По категориям
            </CardTitle>
          </CardHeader>
          <CardContent>
            {by_category.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Нет данных</p>
            ) : (
              <div className="space-y-2">
                {by_category.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <span className="text-sm truncate max-w-[200px]">
                      {item.category__name || 'Без категории'}
                    </span>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">{item.count}</Badge>
                      <span className="font-medium text-sm whitespace-nowrap">
                        {formatAmount(item.total)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface SummaryCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
}

function SummaryCard({ title, value, subtitle, icon, color }: SummaryCardProps) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    red: 'bg-red-50 border-red-200',
    amber: 'bg-amber-50 border-amber-200',
    purple: 'bg-purple-50 border-purple-200',
    green: 'bg-green-50 border-green-200',
  };

  return (
    <Card className={`${colorMap[color] || ''} border`}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
