import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import {
  Search, Filter, CheckCircle, XCircle, Eye,
  Phone, FileText, RefreshCw, BarChart3,
} from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  uploaded: 'Загружен',
  parsing: 'Парсинг',
  matching: 'Подбор',
  review: 'На проверке',
  rfq_sent: 'Запрос поставщикам',
  ready: 'Готова',
  delivered: 'Отправлена',
  error: 'Ошибка',
};

const STATUS_COLORS: Record<string, string> = {
  uploaded: 'bg-gray-100 text-gray-800',
  parsing: 'bg-blue-100 text-blue-800',
  matching: 'bg-indigo-100 text-indigo-800',
  review: 'bg-yellow-100 text-yellow-800',
  rfq_sent: 'bg-purple-100 text-purple-800',
  ready: 'bg-green-100 text-green-800',
  delivered: 'bg-green-200 text-green-900',
  error: 'bg-red-100 text-red-800',
};

export default function PortalRequestsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectId, setRejectId] = useState<number | null>(null);

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (statusFilter) params.set('status', statusFilter);

  const { data: requests, isLoading, refetch } = useQuery({
    queryKey: ['portal-requests', search, statusFilter],
    queryFn: () => (api as any).getPortalRequests(params.toString()),
    staleTime: 30_000,
  });

  const { data: stats } = useQuery({
    queryKey: ['portal-stats'],
    queryFn: () => (api as any).getPortalStats(),
    staleTime: 60_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => (api as any).approvePortalRequest(id),
    onSuccess: () => {
      toast.success('Смета подтверждена и отправлена клиенту');
      queryClient.invalidateQueries({ queryKey: ['portal-requests'] });
      setDetailOpen(false);
    },
    onError: (err: any) => toast.error(err.message || 'Ошибка'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      (api as any).rejectPortalRequest(id, reason),
    onSuccess: () => {
      toast.success('Запрос отклонён');
      queryClient.invalidateQueries({ queryKey: ['portal-requests'] });
      setRejectOpen(false);
      setDetailOpen(false);
    },
    onError: (err: any) => toast.error(err.message || 'Ошибка'),
  });

  const openDetail = async (id: number) => {
    const detail = await (api as any).getPortalRequestDetail(id);
    setSelectedRequest(detail);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Статистика */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.total_requests}</div>
              <div className="text-sm text-muted-foreground">Запросов (30 дн.)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.by_status?.review || 0}</div>
              <div className="text-sm text-muted-foreground">На проверке</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.downloaded_count}</div>
              <div className="text-sm text-muted-foreground">Скачано</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.callback_count}</div>
              <div className="text-sm text-muted-foreground">Заявок на звонок</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">${stats.total_llm_cost?.toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">LLM-стоимость</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Фильтры */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по email, проекту, компании..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Все статусы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Все статусы</SelectItem>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Таблица */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">#</th>
                <th className="text-left p-3 font-medium">Проект</th>
                <th className="text-left p-3 font-medium">Клиент</th>
                <th className="text-left p-3 font-medium">Статус</th>
                <th className="text-center p-3 font-medium">Позиции</th>
                <th className="text-left p-3 font-medium">Дата</th>
                <th className="text-center p-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">Загрузка...</td></tr>
              )}
              {requests?.map((req: any) => (
                <tr key={req.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(req.id)}>
                  <td className="p-3">{req.id}</td>
                  <td className="p-3 font-medium">{req.project_name}</td>
                  <td className="p-3">
                    <div>{req.company_name || req.email}</div>
                    {req.company_name && <div className="text-xs text-muted-foreground">{req.email}</div>}
                  </td>
                  <td className="p-3">
                    <Badge className={STATUS_COLORS[req.status] || ''}>
                      {STATUS_LABELS[req.status] || req.status}
                    </Badge>
                  </td>
                  <td className="text-center p-3">
                    {req.total_spec_items > 0 ? (
                      <span>
                        <span className="text-green-600">{req.matched_exact}</span>
                        {req.matched_analog > 0 && <span className="text-yellow-600"> / {req.matched_analog}</span>}
                        {req.unmatched > 0 && <span className="text-red-600"> / {req.unmatched}</span>}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(req.created_at).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="text-center p-3">
                    <div className="flex justify-center gap-1">
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openDetail(req.id); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {req.status === 'review' && (
                        <>
                          <Button variant="ghost" size="icon" className="text-green-600" onClick={(e) => { e.stopPropagation(); approveMutation.mutate(req.id); }}>
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-600" onClick={(e) => { e.stopPropagation(); setRejectId(req.id); setRejectOpen(true); }}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && (!requests || requests.length === 0) && (
                <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">Нет запросов</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Детальная модалка */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedRequest && (
            <>
              <DialogHeader>
                <DialogTitle>Запрос #{selectedRequest.id} — {selectedRequest.project_name}</DialogTitle>
                <DialogDescription>
                  {selectedRequest.company_name || selectedRequest.email}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Статус: </span>
                    <Badge className={STATUS_COLORS[selectedRequest.status] || ''}>
                      {STATUS_LABELS[selectedRequest.status]}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Прогресс: </span>
                    {selectedRequest.progress_percent}%
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email: </span>
                    {selectedRequest.email}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Телефон: </span>
                    {selectedRequest.phone || '—'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Файлов: </span>
                    {selectedRequest.processed_files}/{selectedRequest.total_files}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Позиций: </span>
                    {selectedRequest.total_spec_items}
                    {selectedRequest.matched_exact > 0 && <span className="text-green-600 ml-1">({selectedRequest.matched_exact} точных)</span>}
                  </div>
                  {selectedRequest.estimate_number && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Смета: </span>
                      <a href={`/estimates/estimates`} className="text-blue-600 hover:underline">
                        {selectedRequest.estimate_number}
                      </a>
                    </div>
                  )}
                  {selectedRequest.error_message && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Ошибка: </span>
                      <span className="text-red-600">{selectedRequest.error_message}</span>
                    </div>
                  )}
                </div>

                {/* Файлы */}
                {selectedRequest.files?.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Файлы</h4>
                    <div className="space-y-1 text-sm">
                      {selectedRequest.files.map((f: any) => (
                        <div key={f.id} className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span>{f.original_filename}</span>
                          <Badge variant="outline" className="text-xs">
                            {f.parse_status}
                          </Badge>
                          {f.pages_total > 0 && (
                            <span className="text-muted-foreground text-xs">
                              ({f.pages_processed}/{f.pages_total} стр.)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Заявки на звонок */}
                {selectedRequest.callbacks?.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Заявки на звонок</h4>
                    <div className="space-y-1 text-sm">
                      {selectedRequest.callbacks.map((cb: any) => (
                        <div key={cb.id} className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{cb.phone}</span>
                          {cb.comment && <span className="text-muted-foreground">— {cb.comment}</span>}
                          <Badge variant="outline" className="text-xs">{cb.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {selectedRequest.status === 'review' && (
                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setRejectId(selectedRequest.id); setRejectOpen(true); }}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Отклонить
                  </Button>
                  <Button
                    onClick={() => approveMutation.mutate(selectedRequest.id)}
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Подтвердить и отправить
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Модалка отклонения */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отклонить запрос</DialogTitle>
            <DialogDescription>Укажите причину отклонения (будет отправлена клиенту).</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Причина отклонения..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Отмена</Button>
            <Button
              variant="destructive"
              onClick={() => rejectId && rejectMutation.mutate({ id: rejectId, reason: rejectReason })}
              disabled={rejectMutation.isPending}
            >
              Отклонить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
