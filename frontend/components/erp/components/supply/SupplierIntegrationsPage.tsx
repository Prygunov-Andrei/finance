import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Plus, RefreshCw, Settings, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import type { SupplierIntegration, SupplierSyncStatus } from '../../types/supplier';

export function SupplierIntegrationsPage() {
  const navigate = useNavigate();
    const [integrations, setIntegrations] = useState<SupplierIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingCatalog, setSyncingCatalog] = useState<number | null>(null);
  const [syncingStock, setSyncingStock] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [statuses, setStatuses] = useState<Record<number, SupplierSyncStatus>>({});

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await (api as any).getSupplierIntegrations();
      setIntegrations(data.results || []);
      // Загрузить статусы для каждой
      for (const integration of (data.results || [])) {
        try {
          const status = await (api as any).getSupplierSyncStatus(integration.id);
          setStatuses(prev => ({ ...prev, [integration.id]: status }));
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      toast.error(`Ошибка загрузки: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSyncCatalog = async (id: number) => {
    try {
      setSyncingCatalog(id);
      await (api as any).syncSupplierCatalog(id);
      toast.success('Импорт каталога запущен');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSyncingCatalog(null);
    }
  };

  const handleSyncStock = async (id: number) => {
    try {
      setSyncingStock(id);
      await (api as any).syncSupplierStock(id);
      toast.success('Синхронизация остатков запущена');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSyncingStock(null);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Не выполнялась';
    return new Date(date).toLocaleString('ru-RU');
  };

  const getStatusBadge = (log: any | null) => {
    if (!log) return <Badge variant="outline">Не выполнялась</Badge>;
    switch (log.status) {
      case 'success': return <Badge className="bg-green-100 text-green-700">Успешно</Badge>;
      case 'partial': return <Badge className="bg-yellow-100 text-yellow-700">Частично</Badge>;
      case 'failed': return <Badge variant="destructive">Ошибка</Badge>;
      case 'started': return <Badge className="bg-blue-100 text-blue-700">В процессе</Badge>;
      default: return <Badge variant="outline">{log.status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Интеграции поставщиков</h1>
          <p className="text-muted-foreground">Подключение к API поставщиков для импорта каталогов и синхронизации цен</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Добавить поставщика
        </Button>
      </div>

      {integrations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Нет подключённых поставщиков</h3>
            <p className="text-muted-foreground mb-4">Добавьте поставщика для импорта каталога и синхронизации цен</p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Добавить поставщика
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {integrations.map((integration) => {
            const status = statuses[integration.id];
            return (
              <Card key={integration.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/supply/integrations/${integration.id}`)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">{integration.name}</CardTitle>
                      <Badge variant={integration.is_active ? 'default' : 'secondary'}>
                        {integration.is_active ? 'Активна' : 'Неактивна'}
                      </Badge>
                      {integration.counterparty_name && (
                        <span className="text-sm text-muted-foreground">{integration.counterparty_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSyncCatalog(integration.id)}
                        disabled={syncingCatalog === integration.id || !integration.is_active}
                      >
                        {syncingCatalog === integration.id ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-1" />
                        )}
                        Синхр. каталог
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSyncStock(integration.id)}
                        disabled={syncingStock === integration.id || !integration.is_active}
                      >
                        {syncingStock === integration.id ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-1" />
                        )}
                        Синхр. остатки
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Товаров</p>
                      <p className="font-medium">{status?.products_count ?? integration.products_count ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Последняя синхр. каталога</p>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(status?.last_catalog_sync)}
                        <span className="text-xs">{formatDate(integration.last_catalog_sync)}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Последняя синхр. остатков</p>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(status?.last_stock_sync)}
                        <span className="text-xs">{formatDate(integration.last_stock_sync)}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Провайдер</p>
                      <p className="font-medium capitalize">{integration.provider}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateIntegrationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => { setCreateOpen(false); loadData(); }}
      />
    </div>
  );
}

function CreateIntegrationDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
    const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    provider: 'breez',
    base_url: 'https://api.breez.ru/v1',
    auth_header: '',
  });

  const handleSubmit = async () => {
    if (!form.name || !form.base_url || !form.auth_header) {
      toast.error('Заполните все поля');
      return;
    }
    try {
      setSaving(true);
      await (api as any).createSupplierIntegration(form);
      toast.success('Поставщик добавлен');
      onCreated();
      setForm({ name: '', provider: 'breez', base_url: 'https://api.breez.ru/v1', auth_header: '' });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Добавить поставщика</DialogTitle>
          <DialogDescription>Настройте подключение к API поставщика</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Название</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Breez" />
          </div>
          <div>
            <Label>Провайдер</Label>
            <Select value={form.provider} onValueChange={v => setForm({ ...form, provider: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="breez">Бриз</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>URL API</Label>
            <Input value={form.base_url} onChange={e => setForm({ ...form, base_url: e.target.value })} placeholder="https://api.breez.ru/v1" />
          </div>
          <div>
            <Label>Authorization Header</Label>
            <Input
              type="password"
              value={form.auth_header}
              onChange={e => setForm({ ...form, auth_header: e.target.value })}
              placeholder="Basic ..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Добавить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
