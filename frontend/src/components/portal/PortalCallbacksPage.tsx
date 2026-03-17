import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { toast } from 'sonner';
import { Phone, CheckCircle } from 'lucide-react';
import { useState } from 'react';

const CALLBACK_STATUS_LABELS: Record<string, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  completed: 'Обработана',
  cancelled: 'Отменена',
};

const CALLBACK_STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

export default function PortalCallbacksPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');

  const params = statusFilter ? `status=${statusFilter}` : '';

  const { data: callbacks, isLoading } = useQuery({
    queryKey: ['portal-callbacks', statusFilter],
    queryFn: () => (api as any).getPortalCallbacks(params),
    staleTime: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      (api as any).updateCallbackStatus(id, status),
    onSuccess: () => {
      toast.success('Статус обновлён');
      queryClient.invalidateQueries({ queryKey: ['portal-callbacks'] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Заявки на звонок</h2>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Все статусы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Все</SelectItem>
            {Object.entries(CALLBACK_STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Телефон</th>
                <th className="text-left p-3 font-medium">Клиент</th>
                <th className="text-left p-3 font-medium">Проект</th>
                <th className="text-left p-3 font-medium">Комментарий</th>
                <th className="text-left p-3 font-medium">Статус</th>
                <th className="text-left p-3 font-medium">Дата</th>
                <th className="text-center p-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">Загрузка...</td></tr>
              )}
              {callbacks?.map((cb: any) => (
                <tr key={cb.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-mono">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {cb.phone}
                    </div>
                  </td>
                  <td className="p-3">
                    <div>{cb.request_company || cb.request_email}</div>
                  </td>
                  <td className="p-3">{cb.request_project}</td>
                  <td className="p-3 text-muted-foreground max-w-[200px] truncate">
                    {cb.comment || '—'}
                  </td>
                  <td className="p-3">
                    <Badge className={CALLBACK_STATUS_COLORS[cb.status] || ''}>
                      {CALLBACK_STATUS_LABELS[cb.status] || cb.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(cb.created_at).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="text-center p-3">
                    {cb.status === 'new' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateMutation.mutate({ id: cb.id, status: 'in_progress' })}
                      >
                        В работу
                      </Button>
                    )}
                    {cb.status === 'in_progress' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-green-600"
                        onClick={() => updateMutation.mutate({ id: cb.id, status: 'completed' })}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Выполнено
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!isLoading && (!callbacks || callbacks.length === 0) && (
                <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">Нет заявок</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
