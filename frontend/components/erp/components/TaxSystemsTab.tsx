import { TaxSystem } from '../lib/api';
import { Loader2, ScrollText, Check, X } from 'lucide-react';
import { useTaxSystems } from '../hooks';

export function TaxSystemsTab() {
  const { data: taxSystems, isLoading, error } = useTaxSystems();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-xl">
        Ошибка загрузки: {(error as Error).message}
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Налоговые системы</h2>
          <p className="text-sm text-gray-500 mt-1">
            Справочник систем налогообложения (только для чтения)
          </p>
        </div>
        <div className="text-sm text-gray-600">
          {taxSystems?.length || 0} {taxSystems?.length === 1 ? 'система' : 'систем'}
        </div>
      </div>

      {!taxSystems || taxSystems.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <ScrollText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Нет систем налогообложения</p>
          <p className="text-sm text-gray-400 mt-2">
            Справочник заполняется на бэкенде
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Код
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Название
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ставка НДС
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Есть НДС
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Активна
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {taxSystems.map((system: TaxSystem) => (
                  <tr key={system.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-mono text-gray-900">
                        {system.code || '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{system.name}</div>
                      {system.description && (
                        <div className="text-xs text-gray-500 mt-1">{system.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm text-gray-900">
                        {system.vat_rate ? `${parseFloat(system.vat_rate)}%` : '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {system.has_vat ? (
                        <Check className="w-5 h-5 text-green-600 mx-auto" />
                      ) : (
                        <X className="w-5 h-5 text-gray-400 mx-auto" />
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {system.is_active ? (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">
                          Активна
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                          Неактивна
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
