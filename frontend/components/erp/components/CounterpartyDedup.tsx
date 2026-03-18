import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, CounterpartyDuplicateGroup } from '@/lib/api';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Loader2, Merge, CheckCircle2, XCircle, AlertTriangle, Search, ArrowLeft } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { toast } from 'sonner';

type FnsValidation = Record<string, { found: boolean; fns_name?: string; status?: string; error?: string }>;

// Состояние выбора для каждой группы: keepId + набор id для удаления
type GroupSelection = {
  keepId: number | null;
  removeIds: Set<number>;
};

export function CounterpartyDedup({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();
  const [selections, setSelections] = useState<Record<number, GroupSelection>>({});
  const [mergeConfirm, setMergeConfirm] = useState<{ groupIdx: number; group: CounterpartyDuplicateGroup } | null>(null);
  const [fnsResults, setFnsResults] = useState<FnsValidation>({});
  const [validatingGroup, setValidatingGroup] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['counterparty-duplicates'],
    queryFn: () => api.getCounterpartyDuplicates(0.85),
  });

  const mergeMutation = useMutation({
    mutationFn: ({ keepId, removeIds }: { keepId: number; removeIds: number[] }) =>
      api.mergeCounterparties(keepId, removeIds),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['counterparty-duplicates'] });
      queryClient.invalidateQueries({ queryKey: ['counterparties'] });
      queryClient.invalidateQueries({ queryKey: ['counterparties-paginated'] });
      const movedStr = Object.entries(result.relations_moved)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      toast.success(`Объединено ${result.merged} дубликатов. ${movedStr ? `Перенесено: ${movedStr}` : ''}`);
      setMergeConfirm(null);
    },
    onError: (err: any) => {
      toast.error(`Ошибка слияния: ${err?.message || 'Неизвестная ошибка'}`);
    },
  });

  const getSelection = (groupIdx: number): GroupSelection =>
    selections[groupIdx] || { keepId: null, removeIds: new Set() };

  const setKeepId = (groupIdx: number, id: number) => {
    setSelections(prev => {
      const sel = prev[groupIdx] || { keepId: null, removeIds: new Set() };
      const newRemove = new Set(sel.removeIds);
      newRemove.delete(id); // нельзя одновременно оставить и удалить
      return { ...prev, [groupIdx]: { keepId: id, removeIds: newRemove } };
    });
  };

  const toggleRemoveId = (groupIdx: number, id: number) => {
    setSelections(prev => {
      const sel = prev[groupIdx] || { keepId: null, removeIds: new Set() };
      if (sel.keepId === id) return prev; // нельзя удалить того, кого оставляем
      const newRemove = new Set(sel.removeIds);
      if (newRemove.has(id)) newRemove.delete(id);
      else newRemove.add(id);
      return { ...prev, [groupIdx]: { ...sel, removeIds: newRemove } };
    });
  };

  const handleValidateGroup = async (groupIdx: number, group: CounterpartyDuplicateGroup) => {
    setValidatingGroup(groupIdx);
    try {
      const inns = group.counterparties.map(cp => cp.inn);
      const response = await api.validateCounterpartyInns(inns);
      setFnsResults(prev => ({ ...prev, ...response.results }));
    } catch (err: any) {
      toast.error(`Ошибка проверки ФНС: ${err?.message || ''}`);
    } finally {
      setValidatingGroup(null);
    }
  };

  const handleMerge = (groupIdx: number, group: CounterpartyDuplicateGroup) => {
    const sel = getSelection(groupIdx);
    if (!sel.keepId) {
      toast.error('Выберите контрагента, который останется (зелёная кнопка)');
      return;
    }
    if (sel.removeIds.size === 0) {
      toast.error('Отметьте хотя бы одного контрагента для удаления (красный чекбокс)');
      return;
    }
    setMergeConfirm({ groupIdx, group });
  };

  const executeMerge = () => {
    if (!mergeConfirm) return;
    const { groupIdx } = mergeConfirm;
    const sel = getSelection(groupIdx);
    if (!sel.keepId) return;
    mergeMutation.mutate({ keepId: sel.keepId, removeIds: Array.from(sel.removeIds) });
  };

  const groups = data?.groups || [];

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Назад
          </Button>
          <h1 className="text-2xl font-semibold">Дедупликация контрагентов</h1>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          <strong>Как пользоваться:</strong>
          <ol className="list-decimal ml-6 mt-1 space-y-0.5">
            <li>Нажмите «Проверить ИНН в ФНС» — увидите, какие ИНН реальные</li>
            <li>Отметьте <strong>зелёной кнопкой</strong> контрагента, который останется</li>
            <li>Отметьте <strong>красными чекбоксами</strong> дубликаты для удаления</li>
            <li>Нажмите «Объединить» — счета и товары перенесутся, дубли удалятся</li>
          </ol>
          <p className="mt-2">
            Если в группе несколько <em>разных реальных</em> компаний с одинаковым названием —
            просто не отмечайте их чекбоксами, и они останутся.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl">
            Ошибка: {(error as Error).message}
          </div>
        )}

        {!isLoading && groups.length === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-green-700 text-lg">Дубликатов не найдено</p>
          </div>
        )}

        <div className="space-y-6">
          {groups.map((group, groupIdx) => {
            const sel = getSelection(groupIdx);
            return (
              <DuplicateGroupCard
                key={groupIdx}
                group={group}
                groupIdx={groupIdx}
                keepId={sel.keepId}
                removeIds={sel.removeIds}
                onSelectKeep={(id) => setKeepId(groupIdx, id)}
                onToggleRemove={(id) => toggleRemoveId(groupIdx, id)}
                onValidate={() => handleValidateGroup(groupIdx, group)}
                onMerge={() => handleMerge(groupIdx, group)}
                isValidating={validatingGroup === groupIdx}
                isMerging={mergeMutation.isPending}
                fnsResults={fnsResults}
              />
            );
          })}
        </div>

        <AlertDialog open={mergeConfirm !== null} onOpenChange={(open) => { if (!open) setMergeConfirm(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Подтвердите слияние</AlertDialogTitle>
              <AlertDialogDescription>
                {mergeConfirm && (() => {
                  const sel = getSelection(mergeConfirm.groupIdx);
                  const keep = mergeConfirm.group.counterparties.find(cp => cp.id === sel.keepId);
                  const removeCount = sel.removeIds.size;
                  const untouched = mergeConfirm.group.counterparties.length - 1 - removeCount;
                  return (
                    <>
                      Останется: <strong>{keep?.name}</strong> (ИНН: {keep?.inn})<br />
                      Будет удалено: {removeCount} дубликат(ов).<br />
                      {untouched > 0 && <>Не затронуто: {untouched} контрагент(ов).<br /></>}
                      Все связанные счета, договоры и товары будут перенесены.
                    </>
                  );
                })()}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={executeMerge}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                {mergeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Merge className="w-4 h-4 mr-1" />}
                Объединить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}


function DuplicateGroupCard({
  group,
  groupIdx,
  keepId,
  removeIds,
  onSelectKeep,
  onToggleRemove,
  onValidate,
  onMerge,
  isValidating,
  isMerging,
  fnsResults,
}: {
  group: CounterpartyDuplicateGroup;
  groupIdx: number;
  keepId: number | null;
  removeIds: Set<number>;
  onSelectKeep: (id: number) => void;
  onToggleRemove: (id: number) => void;
  onValidate: () => void;
  onMerge: () => void;
  isValidating: boolean;
  isMerging: boolean;
  fnsResults: FnsValidation;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div>
          <span className="font-medium text-gray-900">
            «{group.normalized_name}»
          </span>
          <span className="ml-3 text-sm text-gray-500">
            {group.counterparties.length} записей
            {group.similarity < 1 && ` • похожесть: ${Math.round(group.similarity * 100)}%`}
          </span>
          {removeIds.size > 0 && (
            <span className="ml-3 text-sm text-red-600 font-medium">
              к удалению: {removeIds.size}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onValidate}
            disabled={isValidating}
          >
            {isValidating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Search className="w-4 h-4 mr-1" />}
            Проверить ИНН в ФНС
          </Button>
          <Button
            size="sm"
            onClick={onMerge}
            disabled={!keepId || removeIds.size === 0 || isMerging}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isMerging ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Merge className="w-4 h-4 mr-1" />}
            Объединить
          </Button>
        </div>
      </div>

      <table className="w-full">
        <thead className="text-xs text-gray-500 uppercase bg-gray-50/50">
          <tr>
            <th className="px-3 py-2 text-center w-16">
              <span className="text-green-600">Оставить</span>
            </th>
            <th className="px-3 py-2 text-center w-16">
              <span className="text-red-600">Удалить</span>
            </th>
            <th className="px-4 py-2 text-left">Название</th>
            <th className="px-4 py-2 text-left w-32">ИНН</th>
            <th className="px-4 py-2 text-left w-64">ФНС</th>
            <th className="px-4 py-2 text-center w-20">Счета</th>
            <th className="px-4 py-2 text-center w-20">Договоры</th>
            <th className="px-4 py-2 text-center w-20">Цены</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {group.counterparties.map((cp) => {
            const fns = fnsResults[cp.inn];
            const isKeep = keepId === cp.id;
            const isRemove = removeIds.has(cp.id);

            return (
              <tr
                key={cp.id}
                className={`${isKeep ? 'bg-green-50' : isRemove ? 'bg-red-50' : ''} hover:bg-gray-50`}
              >
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => onSelectKeep(cp.id)}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors mx-auto ${
                      isKeep
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {isKeep && <CheckCircle2 className="w-4 h-4" />}
                  </button>
                </td>
                <td className="px-3 py-2 text-center">
                  {!isKeep && (
                    <div className="flex justify-center">
                      <Checkbox
                        checked={isRemove}
                        onCheckedChange={() => onToggleRemove(cp.id)}
                        className="border-red-300 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
                      />
                    </div>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className={`text-sm font-medium ${isRemove ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{cp.name}</div>
                  {cp.short_name && <div className="text-xs text-gray-500">{cp.short_name}</div>}
                </td>
                <td className="px-4 py-2">
                  <span className={`font-mono text-sm ${isRemove ? 'text-gray-400' : 'text-gray-700'}`}>{cp.inn}</span>
                </td>
                <td className="px-4 py-2">
                  {fns ? (
                    fns.found ? (
                      <div>
                        <div className="flex items-center gap-1 text-green-600 text-xs font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Найден в ФНС
                        </div>
                        {fns.fns_name && (
                          <div className="text-xs text-gray-500 mt-0.5 truncate max-w-[240px]" title={fns.fns_name}>
                            {fns.fns_name}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-1 text-red-600 text-xs font-medium">
                          <XCircle className="w-3.5 h-3.5" />
                          {fns.error ? 'Ошибка ФНС' : 'Не найден'}
                        </div>
                        {fns.error && (
                          <div className="text-xs text-red-400 mt-0.5 truncate max-w-[240px]" title={fns.error}>
                            {fns.error}
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-sm ${cp._relations?.invoices_count ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                    {cp._relations?.invoices_count || 0}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-sm ${cp._relations?.contracts_count ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                    {cp._relations?.contracts_count || 0}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  <span className={`text-sm ${cp._relations?.price_history_count ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                    {cp._relations?.price_history_count || 0}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
