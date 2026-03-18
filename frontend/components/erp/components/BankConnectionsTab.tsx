import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, BankConnection, CreateBankConnectionData, LegalEntity } from '../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Landmark, Loader2, Plus, MoreVertical, Pencil, Trash2, Wifi, WifiOff, RefreshCw, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLegalEntities } from '../hooks';
import { CONSTANTS } from '../constants';

export const BankConnectionsTab = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<BankConnection | null>(null);
  const [deletingConnection, setDeletingConnection] = useState<BankConnection | null>(null);
  const queryClient = useQueryClient();

  const { data: connections, isLoading, error } = useQuery({
    queryKey: ['bank-connections'],
    queryFn: () => api.getBankConnections(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: entities } = useLegalEntities();

  const createMutation = useMutation({
    mutationFn: (data: CreateBankConnectionData) => api.createBankConnection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-connections'] });
      setIsDialogOpen(false);
      toast.success('Банковское подключение создано');
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message || 'Неизвестная ошибка'}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateBankConnectionData> }) =>
      api.updateBankConnection(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-connections'] });
      setEditingConnection(null);
      toast.success('Подключение обновлено');
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteBankConnection(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-connections'] });
      setDeletingConnection(null);
      toast.success('Подключение удалено');
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
      setDeletingConnection(null);
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: number) => api.testBankConnection(id),
    onSuccess: (data) => {
      if (data.status === 'ok') {
        toast.success('Подключение работает');
      } else {
        toast.error(`Ошибка: ${data.message}`);
      }
    },
    onError: (error: any) => {
      toast.error(`Ошибка тестирования: ${error.message}`);
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
          {connections?.length || 0} подключений
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Добавить подключение
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новое банковское подключение</DialogTitle>
            <DialogDescription>Настройте подключение к банковскому API</DialogDescription>
          </DialogHeader>
          <BankConnectionForm
            entities={entities || []}
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingConnection} onOpenChange={(open) => !open && setEditingConnection(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Редактировать подключение</DialogTitle>
            <DialogDescription>Измените настройки банковского подключения</DialogDescription>
          </DialogHeader>
          {editingConnection && (
            <BankConnectionForm
              connection={editingConnection}
              entities={entities || []}
              onSubmit={(data) => updateMutation.mutate({ id: editingConnection.id, data })}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingConnection} onOpenChange={(open) => !open && setDeletingConnection(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить подключение?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Подключение "{deletingConnection?.name}" и все связанные данные будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingConnection && deleteMutation.mutate(deletingConnection.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!connections || connections.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <Landmark className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-2">Нет банковских подключений</p>
          <p className="text-sm text-gray-400 mb-4">
            Добавьте подключение к банку для работы с выписками и платежами
          </p>
          <Button onClick={() => setIsDialogOpen(true)} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Добавить первое подключение
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {connections.map((conn: BankConnection) => (
            <div
              key={conn.id}
              className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  conn.is_active ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  <Landmark className={`w-5 h-5 ${conn.is_active ? 'text-green-600' : 'text-gray-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{conn.name}</h3>
                  <p className="text-sm text-gray-500">{conn.legal_entity_name}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => testMutation.mutate(conn.id)}>
                      <Wifi className="w-4 h-4 mr-2" />
                      Тест подключения
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditingConnection(conn)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Редактировать
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setDeletingConnection(conn)}
                      className="text-red-600"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Провайдер</span>
                  <span className="font-medium text-gray-700">{conn.provider_display}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Режим платежей</span>
                  <span className="font-medium text-gray-700">{conn.payment_mode_display}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Статус</span>
                  {conn.is_active ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <Check className="w-3 h-3" /> Активно
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-gray-400">
                      <X className="w-3 h-3" /> Неактивно
                    </span>
                  )}
                </div>
                {conn.last_sync_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Последняя синхронизация</span>
                    <span className="text-gray-700">
                      {new Date(conn.last_sync_at).toLocaleString('ru-RU')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Форма создания/редактирования подключения ──────────────────

interface BankConnectionFormProps {
  connection?: BankConnection;
  entities: LegalEntity[];
  onSubmit: (data: CreateBankConnectionData) => void;
  isLoading: boolean;
}

const BankConnectionForm = ({ connection, entities, onSubmit, isLoading }: BankConnectionFormProps) => {
  const [formData, setFormData] = useState({
    name: connection?.name || '',
    legal_entity: connection?.legal_entity?.toString() || '',
    provider: connection?.provider || 'tochka',
    client_id: '',
    client_secret: '',
    customer_code: connection?.customer_code || '',
    payment_mode: connection?.payment_mode || 'for_sign',
    is_active: connection?.is_active !== false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.legal_entity) {
      toast.error('Заполните обязательные поля');
      return;
    }

    // При создании требуем client_id и client_secret
    if (!connection && (!formData.client_id.trim() || !formData.client_secret.trim())) {
      toast.error('Введите Client ID и Client Secret');
      return;
    }

    const data: any = {
      name: formData.name,
      legal_entity: parseInt(formData.legal_entity),
      provider: formData.provider,
      customer_code: formData.customer_code,
      payment_mode: formData.payment_mode,
      is_active: formData.is_active,
    };

    // Отправляем credentials только если заполнены
    if (formData.client_id.trim()) data.client_id = formData.client_id;
    if (formData.client_secret.trim()) data.client_secret = formData.client_secret;

    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="conn-name">
            Название подключения <span className="text-red-500">*</span>
          </Label>
          <Input
            id="conn-name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder='Точка — основной счёт ООО "Август"'
            disabled={isLoading}
            className="mt-1.5"
            required
          />
        </div>

        <div className="col-span-2">
          <Label htmlFor="conn-entity">
            Юридическое лицо <span className="text-red-500">*</span>
          </Label>
          <Select
            value={formData.legal_entity}
            onValueChange={(value) => setFormData({ ...formData, legal_entity: value })}
            disabled={isLoading}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="Выберите компанию" />
            </SelectTrigger>
            <SelectContent>
              {entities.map((entity) => (
                <SelectItem key={entity.id} value={entity.id.toString()}>
                  {entity.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Учётные данные API</h4>
        </div>

        <div>
          <Label htmlFor="conn-client-id">
            Client ID {!connection && <span className="text-red-500">*</span>}
          </Label>
          <Input
            id="conn-client-id"
            value={formData.client_id}
            onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
            placeholder={connection ? '(не изменять)' : 'Введите Client ID'}
            disabled={isLoading}
            className="mt-1.5"
            type="password"
            autoComplete="off"
          />
          {connection && (
            <p className="text-xs text-gray-500 mt-1">Оставьте пустым, чтобы не менять</p>
          )}
        </div>

        <div>
          <Label htmlFor="conn-client-secret">
            Client Secret {!connection && <span className="text-red-500">*</span>}
          </Label>
          <Input
            id="conn-client-secret"
            value={formData.client_secret}
            onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
            placeholder={connection ? '(не изменять)' : 'Введите Client Secret'}
            disabled={isLoading}
            className="mt-1.5"
            type="password"
            autoComplete="off"
          />
        </div>

        <div>
          <Label htmlFor="conn-customer-code">Customer Code</Label>
          <Input
            id="conn-customer-code"
            value={formData.customer_code}
            onChange={(e) => setFormData({ ...formData, customer_code: e.target.value })}
            placeholder="customerCode из банка"
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="conn-payment-mode">Режим платежей</Label>
          <Select
            value={formData.payment_mode}
            onValueChange={(value) => setFormData({ ...formData, payment_mode: value as any })}
            disabled={isLoading}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="for_sign">Черновик (подпись через банк)</SelectItem>
              <SelectItem value="auto_sign">Автоподпись через API</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2 flex items-center gap-3 pt-2">
          <Switch
            id="conn-active"
            checked={formData.is_active}
            onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            disabled={isLoading}
          />
          <Label htmlFor="conn-active" className="cursor-pointer">
            Подключение активно
          </Label>
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {connection ? 'Сохранение...' : 'Создание...'}
            </>
          ) : (
            connection ? 'Сохранить' : 'Создать'
          )}
        </Button>
      </div>
    </form>
  );
};
