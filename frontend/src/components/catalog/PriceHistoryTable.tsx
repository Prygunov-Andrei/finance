import { ProductPriceHistory } from '../../types/catalog';
import { formatDate, formatCurrency } from '../../lib/utils';

interface PriceHistoryTableProps {
  prices: ProductPriceHistory[];
  isLoading?: boolean;
}

export function PriceHistoryTable({ prices, isLoading }: PriceHistoryTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!prices || prices.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        История цен отсутствует
      </div>
    );
  }

  // Сортировка по дате (последние сверху)
  const sortedPrices = [...prices].sort((a, b) => {
    return new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime();
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-4">Дата</th>
            <th className="text-left py-3 px-4">Поставщик</th>
            <th className="text-right py-3 px-4">Цена</th>
            <th className="text-left py-3 px-4">Ед.изм.</th>
            <th className="text-left py-3 px-4">№ Счёта</th>
            <th className="text-left py-3 px-4">Платёж</th>
          </tr>
        </thead>
        <tbody>
          {sortedPrices.map((price) => (
            <tr key={price.id} className="border-b hover:bg-gray-50">
              <td className="py-3 px-4">
                {formatDate(price.invoice_date)}
              </td>
              <td className="py-3 px-4">
                {price.counterparty_name}
              </td>
              <td className="py-3 px-4 text-right">
                {formatCurrency(parseFloat(price.price))}
              </td>
              <td className="py-3 px-4">
                {price.unit}
              </td>
              <td className="py-3 px-4">
                {price.invoice_number}
              </td>
              <td className="py-3 px-4">
                {price.payment ? (
                  <a
                    href={`/payments/${price.payment}`}
                    className="text-blue-600 hover:underline"
                  >
                    Платёж #{price.payment}
                  </a>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}