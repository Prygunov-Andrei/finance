import { InvoiceItem } from '../../lib/api';
import { formatAmount } from '../../lib/utils';

interface InvoiceItemsTableProps {
  items: InvoiceItem[];
  readonly?: boolean;
}

export function InvoiceItemsTable({ items, readonly = false }: InvoiceItemsTableProps) {
  // Рассчитываем сумму для каждой позиции
  const itemsWithAmounts = items.map(item => {
    const quantity = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.price_per_unit) || 0;
    const amount = (quantity * price).toFixed(2);
    return { ...item, amount };
  });

  // Рассчитываем итого
  const total = itemsWithAmounts.reduce((sum, item) => sum + parseFloat(item.amount || '0'), 0);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <h3 className="font-medium text-sm">Позиции счёта</h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-700 w-12">№</th>
              <th className="px-4 py-2 text-left font-medium text-gray-700">Наименование</th>
              <th className="px-4 py-2 text-right font-medium text-gray-700 w-24">Кол-во</th>
              <th className="px-4 py-2 text-center font-medium text-gray-700 w-20">Ед.изм.</th>
              <th className="px-4 py-2 text-right font-medium text-gray-700 w-32">Цена</th>
              <th className="px-4 py-2 text-right font-medium text-gray-700 w-32">Сумма</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {itemsWithAmounts.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600">{index + 1}</td>
                <td className="px-4 py-3 text-gray-900">{item.raw_name}</td>
                <td className="px-4 py-3 text-right text-gray-900">{item.quantity}</td>
                <td className="px-4 py-3 text-center text-gray-600 text-xs">{item.unit}</td>
                <td className="px-4 py-3 text-right text-gray-900">
                  {formatAmount(item.price_per_unit)} ₽
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  {formatAmount(item.amount)} ₽
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr>
              <td colSpan={5} className="px-4 py-3 text-right font-medium text-gray-900">
                Итого:
              </td>
              <td className="px-4 py-3 text-right font-bold text-gray-900">
                {formatAmount(total)} ₽
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
