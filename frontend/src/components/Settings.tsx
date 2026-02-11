import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, LegalEntity, Account, CreateLegalEntityData, CreateAccountData, TaxSystem, ExpenseCategory, CreateExpenseCategoryData, FNSStats } from '../lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Textarea } from './ui/textarea';
import { Building2, CreditCard, Loader2, Plus, MoreVertical, Pencil, Trash2, FolderTree, ListTree, ScrollText, Check, X, ChevronRight, ShieldCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { TaxSystemsTab } from './TaxSystemsTab';
import { useLegalEntities, useTaxSystems, useAccounts, useExpenseCategories } from '../hooks';
import { formatAmount } from '../lib/utils';
import { CONSTANTS } from '../constants';

export function Settings() {
  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-semibold mb-6">Настройки</h1>
        
        <Tabs defaultValue="entities" className="w-full">
          <TabsList className="grid w-full max-w-4xl grid-cols-5 mb-6">
            <TabsTrigger value="tax-systems" className="flex items-center gap-2">
              <ScrollText className="w-4 h-4" />
              Налоговые системы
            </TabsTrigger>
            <TabsTrigger value="entities" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Мои компании
            </TabsTrigger>
            <TabsTrigger value="accounts" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Счета
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex items-center gap-2">
              <FolderTree className="w-4 h-4" />
              Категории расходов
            </TabsTrigger>
            <TabsTrigger value="fns" className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Интеграция ФНС
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="tax-systems">
            <TaxSystemsTab />
          </TabsContent>
          
          <TabsContent value="entities">
            <LegalEntitiesTab />
          </TabsContent>
          
          <TabsContent value="accounts">
            <AccountsTab />
          </TabsContent>
          
          <TabsContent value="categories">
            <ExpenseCategoriesTab />
          </TabsContent>

          <TabsContent value="fns">
            <FNSIntegrationTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function LegalEntitiesTab() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<LegalEntity | null>(null);
  const [deletingEntity, setDeletingEntity] = useState<LegalEntity | null>(null);
  const queryClient = useQueryClient();

  const { data: entities, isLoading, error } = useLegalEntities();
  const { data: taxSystems } = useTaxSystems();

  const getTaxSystemName = (taxSystem: string | number | TaxSystem): string => {
    if (typeof taxSystem === 'string') return taxSystem;
    if (typeof taxSystem === 'number') {
      const system = taxSystems?.find(s => s.id === taxSystem);
      return system?.name || 'Не указана';
    }
    if (typeof taxSystem === 'object' && taxSystem.name) return taxSystem.name;
    return 'Не указана';
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateLegalEntityData) => api.createLegalEntity(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-entities'] });
      setIsDialogOpen(false);
      toast.success('Компания успешно создана');
    },
    onError: (error: any) => {
      if (error.message && error.message.includes('ИНН already exists')) {
        toast.error('Компания с таким ИНН уже существует');
      } else {
        toast.error(`Ошибка: ${error.message || 'Неизвестная ошибка'}`);
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateLegalEntityData> }) => 
      api.updateLegalEntity(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-entities'] });
      setEditingEntity(null);
      toast.success('Компания успешно обновлена');
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteLegalEntity(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['legal-entities'] });
      setDeletingEntity(null);
      toast.success('Компания успешно удалена');
    },
    onError: (error: any) => {
      if (error.message.includes('Cannot delete') || error.message.includes('связанные')) {
        toast.error('Нельзя удалить компанию, по которой есть операции');
      } else {
        toast.error(`Ошибка: ${error.message}`);
      }
      setDeletingEntity(null);
    },
  });

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
        <div className="text-sm text-gray-600">
          {entities?.length || 0} {entities?.length === 1 ? 'компания' : 'компаний'}
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Добавить компанию
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новая компания</DialogTitle>
            <DialogDescription>Введите информацию о юридическом лице</DialogDescription>
          </DialogHeader>
          <LegalEntityForm 
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingEntity} onOpenChange={(open) => !open && setEditingEntity(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Редактировать компанию</DialogTitle>
            <DialogDescription>Измените информацию о юридическом лице</DialogDescription>
          </DialogHeader>
          {editingEntity && (
            <LegalEntityForm 
              entity={editingEntity}
              onSubmit={(data) => updateMutation.mutate({ id: editingEntity.id, data })}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingEntity} onOpenChange={(open) => !open && setDeletingEntity(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Компания "{deletingEntity?.name}" будет удалена навсегда.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingEntity && deleteMutation.mutate(deletingEntity.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!entities || entities.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">Нет юридических лиц</p>
          <Button onClick={() => setIsDialogOpen(true)} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Добавить первую компанию
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {entities.map((entity: LegalEntity) => (
            <div
              key={entity.id}
              className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{entity.name}</h3>
                  {entity.short_name && (
                    <p className="text-sm text-gray-500">{entity.short_name}</p>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditingEntity(entity)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Редактировать
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setDeletingEntity(entity)}
                      className="text-red-600"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500">ИНН:</span>{' '}
                  <span className="text-gray-900 font-mono">{entity.inn}</span>
                </div>
                {entity.kpp && (
                  <div>
                    <span className="text-gray-500">КПП:</span>{' '}
                    <span className="text-gray-900 font-mono">{entity.kpp}</span>
                  </div>
                )}
                {entity.ogrn && (
                  <div>
                    <span className="text-gray-500">ОГРН:</span>{' '}
                    <span className="text-gray-900 font-mono">{entity.ogrn}</span>
                  </div>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-500">Система налогообложения</div>
                <div className="text-sm font-medium text-gray-700 mt-1">
                  {getTaxSystemName(entity.tax_system)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountsTab() {
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const queryClient = useQueryClient();

  const { data: accounts, isLoading, error } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.getAccounts(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: entities } = useQuery({
    queryKey: ['legal-entities'],
    queryFn: () => api.getLegalEntities(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateAccountData) => api.createAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setIsDialogOpen(false);
      toast.success('Счет успешно создан');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateAccountData> }) => 
      api.updateAccount(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setEditingAccount(null);
      toast.success('Счет успешно обновлен');
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setDeletingAccount(null);
      toast.success('Счет успешно удален');
    },
    onError: (error: any) => {
      if (error.message.includes('Cannot delete') || error.message.includes('связанные')) {
        toast.error('Нельзя удалить счет, по которому есть операции');
      } else {
        toast.error(`Ошибка: ${error.message}`);
      }
      setDeletingAccount(null);
    },
  });

  const getAccountTypeLabel = (type?: string) => {
    switch (type) {
      case 'bank_account': return 'Расчётный счёт';
      case 'cash': return 'Касса';
      case 'deposit': return 'Депозит';
      case 'currency_account': return 'Валютный счёт';
      default: return 'Не указан';
    }
  };

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
        <div className="text-sm text-gray-600">
          {accounts?.length || 0} {accounts?.length === 1 ? 'счет' : 'счетов'}
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Добавить счет
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новый счет</DialogTitle>
            <DialogDescription>Введите информацию о банковском счете</DialogDescription>
          </DialogHeader>
          <AccountForm 
            entities={entities || []}
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingAccount} onOpenChange={(open) => !open && setEditingAccount(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Редактировать счет</DialogTitle>
            <DialogDescription>Измените информацию о банковском счете</DialogDescription>
          </DialogHeader>
          {editingAccount && (
            <AccountForm 
              account={editingAccount}
              entities={entities || []}
              onSubmit={(data) => updateMutation.mutate({ id: editingAccount.id, data })}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingAccount} onOpenChange={(open) => !open && setDeletingAccount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Счет "{deletingAccount?.name}" будет удален навсегда.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingAccount && deleteMutation.mutate(deletingAccount.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!accounts || accounts.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">Нет счетов</p>
          <Button onClick={() => setIsDialogOpen(true)} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Добавить первый счет
          </Button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Юрлицо
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Название
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Тип
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Банк
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Номер
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Валюта
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Баланс
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Активен
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {accounts.map((account: Account) => (
                  <tr 
                    key={account.id} 
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/settings/accounts/${account.id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{account.legal_entity_name || '—'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{account.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                        {getAccountTypeLabel(account.account_type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-700">{account.bank_name || '—'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-700 font-mono">
                        {account.account_number || account.number || '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                        {account.currency}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-bold text-gray-900">
                        {formatAmount(account.current_balance || account.initial_balance || account.balance)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {account.is_active !== false ? (
                        <Check className="w-5 h-5 text-green-600 mx-auto" />
                      ) : (
                        <X className="w-5 h-5 text-gray-400 mx-auto" />
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingAccount(account)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Редактировать
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => setDeletingAccount(account)}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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

function ExpenseCategoriesTab() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<ExpenseCategory | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'tree'>('table');
  const queryClient = useQueryClient();

  const { data: categories, isLoading, error } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.getExpenseCategories(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateExpenseCategoryData) => api.createExpenseCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      setIsDialogOpen(false);
      toast.success('Категория расходов успешно создана');
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message || 'Неизвестная ошибка'}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateExpenseCategoryData> }) => 
      api.updateExpenseCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      setEditingCategory(null);
      toast.success('Категория расходов успешно обновлена');
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteExpenseCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      setDeletingCategory(null);
      toast.success('Категория расходов успешно удалена');
    },
    onError: (error: any) => {
      if (error.message.includes('Cannot delete') || error.message.includes('связанные')) {
        toast.error('Нельзя удалить категорию расходов, по которой есть операции');
      } else {
        toast.error(`Ошибка: ${error.message}`);
      }
      setDeletingCategory(null);
    },
  });

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
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">
            {categories?.length || 0} {categories?.length === 1 ? 'категория' : 'категорий'}
          </div>
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              className="h-8"
            >
              <ListTree className="w-4 h-4 mr-2" />
              Список
            </Button>
            <Button
              variant={viewMode === 'tree' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('tree')}
              className="h-8"
            >
              <FolderTree className="w-4 h-4 mr-2" />
              Дерево
            </Button>
          </div>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Добавить категорию
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новая категория расходов</DialogTitle>
            <DialogDescription>Введите информацию о категории расходов</DialogDescription>
          </DialogHeader>
          <ExpenseCategoryForm 
            categories={categories || []}
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingCategory} onOpenChange={(open) => !open && setEditingCategory(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Редактировать категорию расходов</DialogTitle>
            <DialogDescription>Измените информацию о категории расходов</DialogDescription>
          </DialogHeader>
          {editingCategory && (
            <ExpenseCategoryForm 
              category={editingCategory}
              categories={categories || []}
              onSubmit={(data) => updateMutation.mutate({ id: editingCategory.id, data })}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingCategory} onOpenChange={(open) => !open && setDeletingCategory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Категория "{deletingCategory?.name}" будет удалена навсегда.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingCategory && deleteMutation.mutate(deletingCategory.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!categories || categories.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <FolderTree className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">Нет категорий расходов</p>
          <Button onClick={() => setIsDialogOpen(true)} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Добавить первую категорию
          </Button>
        </div>
      ) : viewMode === 'table' ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Название
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Код
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Родительская категория
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Требует договор
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Активна
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Порядок
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {categories.map((category: ExpenseCategory) => (
                  <tr key={category.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{category.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-700 font-mono">{category.code || '—'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-700">{category.parent_name || '—'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {category.requires_contract ? (
                        <Check className="w-5 h-5 text-green-600 mx-auto" />
                      ) : (
                        <X className="w-5 h-5 text-gray-400 mx-auto" />
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {category.is_active !== false ? (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">
                          Активна
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                          Неактивна
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="text-sm text-gray-700">{category.sort_order ?? 0}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingCategory(category)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Редактировать
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => setDeletingCategory(category)}
                            className="text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <ExpenseCategoriesTreeView
          categories={categories || []}
          onEdit={setEditingCategory}
          onDelete={setDeletingCategory}
        />
      )}
    </div>
  );
}

// Компонент древовидного представления категорий расходов
interface ExpenseCategoriesTreeViewProps {
  categories: ExpenseCategory[];
  onEdit: (category: ExpenseCategory) => void;
  onDelete: (category: ExpenseCategory) => void;
}

function ExpenseCategoriesTreeView({ categories, onEdit, onDelete }: ExpenseCategoriesTreeViewProps) {
  // Построение дерева из плоского списка
  const buildTree = (items: ExpenseCategory[]): ExpenseCategory[] => {
    const map = new Map<number, ExpenseCategory>();
    const roots: ExpenseCategory[] = [];

    // Создаём копии с пустым children
    items.forEach(item => {
      map.set(item.id, { ...item, children: [] });
    });

    // Строим дерево
    items.forEach(item => {
      const node = map.get(item.id)!;
      if (item.parent) {
        const parent = map.get(item.parent);
        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    // Сортируем по sort_order
    const sortChildren = (nodes: ExpenseCategory[]) => {
      nodes.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      nodes.forEach(node => {
        if (node.children && node.children.length > 0) {
          sortChildren(node.children);
        }
      });
    };

    sortChildren(roots);
    return roots;
  };

  const tree = buildTree(categories);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="divide-y divide-gray-200">
        {tree.map((category) => (
          <CategoryTreeNode
            key={category.id}
            category={category}
            level={0}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

// Компонент узла дерева
interface CategoryTreeNodeProps {
  category: ExpenseCategory;
  level: number;
  onEdit: (category: ExpenseCategory) => void;
  onDelete: (category: ExpenseCategory) => void;
}

function CategoryTreeNode({ category, level, onEdit, onDelete }: CategoryTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = category.children && category.children.length > 0;

  return (
    <>
      <div
        className={`flex items-center gap-3 py-3 px-4 hover:bg-gray-50 transition-colors`}
        style={{ paddingLeft: `${level * 24 + 16}px` }}
      >
        {/* Кнопка раскрытия/сворачивания */}
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          {hasChildren ? (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="hover:bg-gray-200 rounded p-0.5 transition-colors"
            >
              <ChevronRight
                className={`w-4 h-4 text-gray-500 transition-transform ${
                  isExpanded ? 'rotate-90' : ''
                }`}
              />
            </button>
          ) : (
            <div className="w-1 h-1 bg-gray-300 rounded-full"></div>
          )}
        </div>

        {/* Иконка папки */}
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <FolderTree className="w-4 h-4 text-blue-600" />
        </div>

        {/* Информация о категории */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900 truncate">{category.name}</h3>
            {category.code && (
              <span className="px-2 py-0.5 text-xs font-mono bg-gray-100 text-gray-600 rounded">
                {category.code}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {category.requires_contract && (
              <span className="text-xs text-blue-600 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Требует договор
              </span>
            )}
            {category.is_active === false && (
              <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                Неактивна
              </span>
            )}
          </div>
        </div>

        {/* Количество дочерних */}
        {hasChildren && (
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {category.children!.length}
          </span>
        )}

        {/* Действия */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(category)}>
              <Pencil className="w-4 h-4 mr-2" />
              Редактировать
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(category)}
              className="text-red-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Дочерние категории */}
      {hasChildren && isExpanded && (
        <>
          {category.children!.map((child) => (
            <CategoryTreeNode
              key={child.id}
              category={child}
              level={level + 1}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </>
      )}
    </>
  );
}

interface LegalEntityFormProps {
  entity?: LegalEntity;
  onSubmit: (data: CreateLegalEntityData) => void;
  isLoading: boolean;
}

function LegalEntityForm({ entity, onSubmit, isLoading }: LegalEntityFormProps) {
  const getTaxSystemId = (): string => {
    if (!entity) return '';
    if (entity.tax_system_id) return entity.tax_system_id.toString();
    if (typeof entity.tax_system === 'number') return entity.tax_system.toString();
    if (typeof entity.tax_system === 'object' && entity.tax_system.id) return entity.tax_system.id.toString();
    return '';
  };
  
  const [formData, setFormData] = useState({
    name: entity?.name || '',
    inn: entity?.inn || '',
    tax_system: getTaxSystemId(),
    short_name: entity?.short_name || '',
    kpp: entity?.kpp || '',
    ogrn: entity?.ogrn || '',
    director: entity?.director?.toString() || '',
    director_name: entity?.director_name || '',
    director_position: entity?.director_position || 'Генеральный директор',
  });

  const { data: taxSystems, isLoading: taxSystemsLoading } = useQuery({
    queryKey: ['tax-systems'],
    queryFn: () => api.getTaxSystems(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.inn.trim() || !formData.tax_system) {
      toast.error('Заполните обязательные поля');
      return;
    }

    const dataToSubmit: any = {
      name: formData.name,
      inn: formData.inn,
      tax_system: parseInt(formData.tax_system),
    };

    if (formData.short_name?.trim()) dataToSubmit.short_name = formData.short_name;
    if (formData.kpp?.trim()) dataToSubmit.kpp = formData.kpp;
    if (formData.ogrn?.trim()) dataToSubmit.ogrn = formData.ogrn;
    if (formData.director?.trim()) dataToSubmit.director = parseInt(formData.director);
    if (formData.director_name?.trim()) dataToSubmit.director_name = formData.director_name;
    if (formData.director_position?.trim()) dataToSubmit.director_position = formData.director_position;

    onSubmit(dataToSubmit);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="name">
            Название <span className="text-red-500">*</span>
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="ООО Ромашка"
            disabled={isLoading}
            className="mt-1.5"
            required
          />
        </div>

        <div>
          <Label htmlFor="short_name">Краткое название</Label>
          <Input
            id="short_name"
            value={formData.short_name}
            onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
            placeholder="Ромашка"
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="inn">
            ИНН <span className="text-red-500">*</span>
          </Label>
          <Input
            id="inn"
            value={formData.inn}
            onChange={(e) => setFormData({ ...formData, inn: e.target.value })}
            placeholder="1234567890"
            disabled={isLoading}
            className="mt-1.5"
            required
          />
        </div>

        <div>
          <Label htmlFor="kpp">КПП</Label>
          <Input
            id="kpp"
            value={formData.kpp}
            onChange={(e) => setFormData({ ...formData, kpp: e.target.value })}
            placeholder="123456789"
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="ogrn">ОГРН</Label>
          <Input
            id="ogrn"
            value={formData.ogrn}
            onChange={(e) => setFormData({ ...formData, ogrn: e.target.value })}
            placeholder="1234567890123"
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>

        <div className="col-span-2">
          <Label htmlFor="tax_system">
            Система налогообложения <span className="text-red-500">*</span>
          </Label>
          <Select
            value={formData.tax_system}
            onValueChange={(value: any) => setFormData({ ...formData, tax_system: value })}
            disabled={isLoading || taxSystemsLoading}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder={taxSystemsLoading ? "Загрузка..." : "Выберите систему налогообложения"} />
            </SelectTrigger>
            <SelectContent>
              {taxSystems && taxSystems.length > 0 ? (
                taxSystems.map((system: TaxSystem) => (
                  <SelectItem key={system.id} value={system.id.toString()}>
                    {system.name}
                  </SelectItem>
                ))
              ) : (
                <div className="p-2 text-sm text-gray-500">Нет доступных систем</div>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Информация о директоре (для документов)</h4>
        </div>

        <div className="col-span-2">
          <Label htmlFor="director_name">ФИО директора</Label>
          <Input
            id="director_name"
            value={formData.director_name}
            onChange={(e) => setFormData({ ...formData, director_name: e.target.value })}
            placeholder="Иванов Иван Иванович"
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>

        <div className="col-span-2">
          <Label htmlFor="director_position">Должность директора</Label>
          <Input
            id="director_position"
            value={formData.director_position}
            onChange={(e) => setFormData({ ...formData, director_position: e.target.value })}
            placeholder="Генеральный директор"
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {entity ? 'Сохранение...' : 'Создание...'}
            </>
          ) : (
            entity ? 'Сохранить' : 'Создать'
          )}
        </Button>
      </div>
    </form>
  );
}

interface AccountFormProps {
  account?: Account;
  entities: LegalEntity[];
  onSubmit: (data: CreateAccountData) => void;
  isLoading: boolean;
}

function AccountForm({ account, entities, onSubmit, isLoading }: AccountFormProps) {
  const [formData, setFormData] = useState({
    legal_entity: account?.legal_entity?.toString() || '',
    name: account?.name || '',
    number: account?.account_number || account?.number || '',
    account_type: account?.account_type || 'bank_account',
    bank_name: account?.bank_name || '',
    bik: account?.bic || account?.bik || '',
    currency: account?.currency || 'RUB',
    initial_balance: account?.initial_balance || account?.balance || '0.00',
    location: account?.location || '',
    description: account?.description || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.legal_entity || !formData.name.trim() || !formData.currency || !formData.account_type) {
      toast.error('Заполните обязательные поля');
      return;
    }

    const dataToSubmit: any = {
      legal_entity: parseInt(formData.legal_entity),
      name: formData.name,
      account_type: formData.account_type,
      currency: formData.currency,
    };

    if (formData.bank_name?.trim()) dataToSubmit.bank_name = formData.bank_name;
    if (formData.bik?.trim()) dataToSubmit.bik = formData.bik;
    if (formData.location?.trim()) dataToSubmit.location = formData.location;
    if (formData.description?.trim()) dataToSubmit.description = formData.description;

    if (!account) {
      if (!formData.number.trim()) {
        toast.error('Заполните номер счета');
        return;
      }
      dataToSubmit.number = formData.number;
      dataToSubmit.initial_balance = formData.initial_balance;
    }

    onSubmit(dataToSubmit);
  };

  const showBankFields = formData.account_type === 'bank_account';
  const showLocationField = formData.account_type === 'cash';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="legal_entity">
            Юридическое лицо <span className="text-red-500">*</span>
          </Label>
          <Select
            value={formData.legal_entity}
            onValueChange={(value: any) => setFormData({ ...formData, legal_entity: value })}
            disabled={isLoading}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="Выберите компанию" />
            </SelectTrigger>
            <SelectContent>
              {entities.length === 0 ? (
                <div className="p-2 text-sm text-gray-500">Нет доступных компаний</div>
              ) : (
                entities.map((entity) => (
                  <SelectItem key={entity.id} value={entity.id.toString()}>
                    {entity.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2">
          <Label htmlFor="name">
            Название счета <span className="text-red-500">*</span>
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Расчетный счет"
            disabled={isLoading}
            className="mt-1.5"
            required
          />
        </div>

        <div>
          <Label htmlFor="account_type">
            Тип счёта <span className="text-red-500">*</span>
          </Label>
          <Select
            value={formData.account_type}
            onValueChange={(value: any) => setFormData({ ...formData, account_type: value })}
            disabled={isLoading}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bank_account">Расчётный счёт</SelectItem>
              <SelectItem value="cash">Касса</SelectItem>
              <SelectItem value="deposit">Депозит</SelectItem>
              <SelectItem value="currency_account">Валютный счёт</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="currency">
            Валюта <span className="text-red-500">*</span>
          </Label>
          <Select
            value={formData.currency}
            onValueChange={(value: any) => setFormData({ ...formData, currency: value })}
            disabled={isLoading}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RUB">RUB (₽)</SelectItem>
              <SelectItem value="USD">USD ($)</SelectItem>
              <SelectItem value="EUR">EUR (€)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2">
          <Label htmlFor="number">
            Номер счета <span className="text-red-500">*</span>
          </Label>
          <Input
            id="number"
            value={formData.number}
            onChange={(e) => setFormData({ ...formData, number: e.target.value })}
            placeholder="40702810000000000000"
            disabled={isLoading || !!account}
            className="mt-1.5"
            required={!account}
          />
          {account && (
            <p className="text-xs text-gray-500 mt-1">Номер счета нельзя изменить</p>
          )}
        </div>

        {showBankFields && (
          <>
            <div>
              <Label htmlFor="bank_name">Банк</Label>
              <Input
                id="bank_name"
                value={formData.bank_name}
                onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                placeholder="Сбербанк"
                disabled={isLoading}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="bik">БИК</Label>
              <Input
                id="bik"
                value={formData.bik}
                onChange={(e) => setFormData({ ...formData, bik: e.target.value })}
                placeholder="044525225"
                disabled={isLoading}
                className="mt-1.5"
              />
            </div>
          </>
        )}

        {showLocationField && (
          <div className="col-span-2">
            <Label htmlFor="location">Местоположение</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="Офис, г. Москва"
              disabled={isLoading}
              className="mt-1.5"
            />
          </div>
        )}

        {!account && (
          <div className="col-span-2">
            <Label htmlFor="initial_balance">Начальный остаток</Label>
            <Input
              id="initial_balance"
              type="number"
              step="0.01"
              value={formData.initial_balance}
              onChange={(e) => setFormData({ ...formData, initial_balance: e.target.value })}
              placeholder="0.00"
              disabled={isLoading}
              className="mt-1.5"
            />
          </div>
        )}

        <div className="col-span-2">
          <Label htmlFor="description">Описание</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Дополнительная информация о счёте"
            disabled={isLoading}
            className="mt-1.5"
            rows={3}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {account ? 'Сохранение...' : 'Создание...'}
            </>
          ) : (
            account ? 'Сохранить' : 'Создать'
          )}
        </Button>
      </div>
    </form>
  );
}

interface ExpenseCategoryFormProps {
  category?: ExpenseCategory;
  categories: ExpenseCategory[];
  onSubmit: (data: CreateExpenseCategoryData) => void;
  isLoading: boolean;
}

function ExpenseCategoryForm({ category, categories, onSubmit, isLoading }: ExpenseCategoryFormProps) {
  const [formData, setFormData] = useState({
    name: category?.name || '',
    code: category?.code || '',
    parent: category?.parent?.toString() || '',
    requires_contract: category?.requires_contract || false,
    is_active: category?.is_active !== false,
    sort_order: category?.sort_order?.toString() || '0',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Заполните обязательные поля');
      return;
    }

    const dataToSubmit: any = {
      name: formData.name,
      requires_contract: formData.requires_contract,
      is_active: formData.is_active,
      sort_order: parseInt(formData.sort_order) || 0,
    };

    if (formData.code?.trim()) dataToSubmit.code = formData.code;
    if (formData.parent?.trim() && formData.parent !== 'none') dataToSubmit.parent = parseInt(formData.parent);

    onSubmit(dataToSubmit);
  };

  const availableParents = categories.filter(c => c.id !== category?.id);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div>
        <Label htmlFor="name">
          Название категории <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Коммунальные платежи"
          disabled={isLoading}
          className="mt-1.5"
          required
        />
      </div>

      <div>
        <Label htmlFor="code">Код</Label>
        <Input
          id="code"
          value={formData.code}
          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
          placeholder="COMM"
          disabled={isLoading}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="parent">Родительская категория</Label>
        <Select
          value={formData.parent}
          onValueChange={(value: any) => setFormData({ ...formData, parent: value })}
          disabled={isLoading}
        >
          <SelectTrigger className="mt-1.5">
            <SelectValue placeholder="Без родительской категории" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Без родительской категории</SelectItem>
            {availableParents.map((cat) => (
              <SelectItem key={cat.id} value={cat.id.toString()}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="sort_order">Порядок сортировки</Label>
          <Input
            id="sort_order"
            type="number"
            value={formData.sort_order}
            onChange={(e) => setFormData({ ...formData, sort_order: e.target.value })}
            placeholder="0"
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>
      </div>

      <div className="flex items-center space-x-2 pt-2">
        <Checkbox
          id="requires_contract"
          checked={formData.requires_contract}
          onCheckedChange={(checked) => 
            setFormData({ ...formData, requires_contract: checked as boolean })
          }
          disabled={isLoading}
        />
        <Label 
          htmlFor="requires_contract" 
          className="text-sm font-normal cursor-pointer"
        >
          Требует привязки к договору
        </Label>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="is_active"
          checked={formData.is_active}
          onCheckedChange={(checked) => 
            setFormData({ ...formData, is_active: checked as boolean })
          }
          disabled={isLoading}
        />
        <Label 
          htmlFor="is_active" 
          className="text-sm font-normal cursor-pointer"
        >
          Активна
        </Label>
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {category ? 'Сохранение...' : 'Создание...'}
            </>
          ) : (
            category ? 'Сохранить' : 'Создать'
          )}
        </Button>
      </div>
    </form>
  );
}

// ─── Вкладка "Интеграция ФНС" ──────────────────────────────────

function FNSIntegrationTab() {
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading, error: statsError, refetch } = useQuery({
    queryKey: ['fns-stats'],
    queryFn: () => api.fnsGetStats(),
    staleTime: 5 * 60_000,
  });

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (statsError) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-xl">
        Ошибка загрузки статистики: {(statsError as Error).message}
      </div>
    );
  }

  if (!stats?.is_configured) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">API-FNS не настроен</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Для проверки контрагентов через ФНС добавьте переменную окружения <code className="bg-gray-100 px-1 rounded">FNS_API_KEY</code> в настройки сервера.
        </p>
      </div>
    );
  }

  const statusColor = stats.status === 'VIP' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600';

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">API-FNS (api-fns.ru)</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['fns-stats'] });
              refetch();
              toast.success('Статистика обновлена');
            }}
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Обновить
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Статус ключа</div>
            <span className={`px-2 py-0.5 text-sm font-medium rounded ${statusColor}`}>
              {stats.status}
            </span>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Дата начала</div>
            <div className="text-sm font-medium">{stats.start_date || '—'}</div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 mb-1">Дата окончания</div>
            <div className="text-sm font-medium">{stats.end_date || '—'}</div>
          </div>
        </div>

        {stats.methods.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Метод</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase w-24">Лимит</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase w-28">Использовано</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase w-24">Остаток</th>
                  <th className="py-2 px-3 text-xs font-medium text-gray-500 uppercase w-48">Прогресс</th>
                </tr>
              </thead>
              <tbody>
                {stats.methods.map((method) => {
                  const usagePercent = method.limit > 0 ? (method.used / method.limit) * 100 : 0;
                  const barColor = usagePercent < 50 ? 'bg-green-500'
                    : usagePercent < 90 ? 'bg-yellow-500'
                    : 'bg-red-500';

                  return (
                    <tr key={method.name} className="border-b border-gray-100 last:border-0">
                      <td className="py-2.5 px-3">
                        <div className="text-sm font-medium">{method.display_name}</div>
                        <div className="text-xs text-gray-400">{method.name}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-sm font-mono">{method.limit}</td>
                      <td className="py-2.5 px-3 text-right text-sm font-mono">{method.used}</td>
                      <td className="py-2.5 px-3 text-right text-sm font-mono font-medium">
                        {method.remaining}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${barColor}`}
                              style={{ width: `${Math.min(usagePercent, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 w-10 text-right">
                            {Math.round(usagePercent)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Нет данных о лимитах</p>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-3">Возможности интеграции</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="font-medium text-blue-700 mb-1">Автозаполнение</div>
            <div className="text-blue-600 text-xs">При создании контрагента — автоподстановка реквизитов по ИНН или названию</div>
          </div>
          <div className="p-3 bg-purple-50 rounded-lg">
            <div className="font-medium text-purple-700 mb-1">Проверка контрагента</div>
            <div className="text-purple-600 text-xs">Позитивные и негативные факторы: массовый адрес, дисквалификация, блокировки</div>
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <div className="font-medium text-green-700 mb-1">Данные ЕГРЮЛ</div>
            <div className="text-green-600 text-xs">Полная выписка: директор, учредители, ОКВЭД, капитал, история изменений</div>
          </div>
          <div className="p-3 bg-orange-50 rounded-lg">
            <div className="font-medium text-orange-700 mb-1">Бухгалтерская отчетность</div>
            <div className="text-orange-600 text-xs">Баланс, P&L, выручка и прибыль по годам (с 2019 года)</div>
          </div>
        </div>
      </div>
    </div>
  );
}