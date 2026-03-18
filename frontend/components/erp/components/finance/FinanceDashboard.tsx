import { useQuery } from '@tanstack/react-query';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Banknote,
  PiggyBank,
  BarChart3,
  Building2,
  Receipt,
  Construction,
  Landmark,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { api, Account } from '../../lib/api';

const formatCurrency = (value: string | number | undefined | null): string => {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
  }).format(num);
};

const StubSection = ({
  icon: Icon,
  title,
  items,
}: {
  icon: React.ElementType;
  title: string;
  items: string[];
}) => (
  <Card className="border-dashed border-gray-300">
    <CardHeader className="pb-3">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-gray-400" />
        <CardTitle className="text-base text-gray-600">{title}</CardTitle>
        <Badge variant="outline" className="ml-auto text-xs text-gray-400">
          В разработке
        </Badge>
      </div>
    </CardHeader>
    <CardContent>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="text-sm text-gray-400 flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-gray-300 shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </CardContent>
  </Card>
);

export const FinanceDashboard = () => {
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts-active'],
    queryFn: () => api.getAccounts({ is_active: true }),
  });

  const accountList: Account[] = Array.isArray(accounts)
    ? accounts
    : (accounts as any)?.results ?? [];

  const totalBalance = accountList.reduce((sum, acc) => {
    const bal = parseFloat(acc.current_balance || acc.balance || '0');
    return sum + (isNaN(bal) ? 0 : bal);
  }, 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Дашборд Финансы</h1>
        <p className="text-sm text-gray-500 mt-1">
          Сводная панель по финансовым показателям компании
        </p>
      </div>

      {/* Итого средств на всех счетах и в кассе */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">
              Итого средств на всех счетах и в кассе
            </CardTitle>
          </div>
          <CardDescription>
            Реальные остатки по данным банка и внутреннего учёта
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-48" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <span className="text-3xl font-bold text-gray-900">
                  {formatCurrency(totalBalance)}
                </span>
              </div>
              {accountList.length === 0 ? (
                <p className="text-sm text-gray-400">Нет активных счетов</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {accountList.map((acc) => {
                    const bal = acc.current_balance || acc.balance || '0';
                    const isCash = acc.account_type === 'cash';
                    return (
                      <div
                        key={acc.id}
                        className="flex items-start gap-3 rounded-lg border p-3"
                      >
                        <div className="mt-0.5">
                          {isCash ? (
                            <Banknote className="h-5 w-5 text-green-600" />
                          ) : (
                            <Landmark className="h-5 w-5 text-blue-500" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-700 truncate">
                            {acc.name}
                          </p>
                          {acc.number && (
                            <p className="text-xs text-gray-400 truncate">
                              {acc.number}
                            </p>
                          )}
                          <p className="text-base font-semibold text-gray-900 mt-1">
                            {formatCurrency(bal)}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className="shrink-0 text-xs"
                        >
                          {isCash ? 'Касса' : acc.currency || 'RUB'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Заглушки */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StubSection
          icon={TrendingDown}
          title="Дебиторская задолженность"
          items={[
            'Итого (подтверждённая / сомнительная)',
            'К получению сегодня',
            'По объектам',
          ]}
        />

        <StubSection
          icon={TrendingUp}
          title="Кредиторская задолженность"
          items={[
            'Итого (Поставщикам / Монтажникам)',
            'Общая сумма',
            'К оплате сегодня (в т.ч. Учредителям и Директорам)',
          ]}
        />

        <StubSection
          icon={BarChart3}
          title="Прибыль"
          items={[
            'Валовая / чистая',
            'По объектам',
            'За период',
          ]}
        />

        <StubSection
          icon={PiggyBank}
          title="Оборотные средства"
          items={[
            'В объектах',
            'Свободные',
          ]}
        />

        <StubSection
          icon={Building2}
          title="Отчёты за периоды"
          items={[
            'С премиями',
            'По объектам',
            'По категориям',
          ]}
        />

        <StubSection
          icon={Construction}
          title="Чистые активы"
          items={[
            'Общая сумма',
            'Динамика по периодам',
          ]}
        />

        <StubSection
          icon={Receipt}
          title="Налоги"
          items={[
            'НДС по объектам и итого',
            'Неоплаченные налоги',
          ]}
        />
      </div>
    </div>
  );
};
