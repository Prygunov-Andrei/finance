import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import { RefreshCw, Loader2, ArrowLeft, Trash2, Save } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import type { SupplierIntegration, SupplierSyncStatus, SupplierCategory, SupplierSyncLog } from '../../types/supplier';

export function SupplierIntegrationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';

  const [integration, setIntegration] = useState<SupplierIntegration | null>(null);
  const [status, setStatus] = useState<SupplierSyncStatus | null>(null);
  const [categories, setCategories] = useState<SupplierCategory[]>([]);
  const [syncLogs, setSyncLogs] = useState<SupplierSyncLog[]>([]);
  const [ourCategories, setOurCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [syncingStock, setSyncingStock] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', base_url: '', auth_header: '', is_active: true });

  const loadIntegration = async () => {
    try {
      setLoading(true);
      const data = await (api as any).getSupplierIntegration(Number(id));
      setIntegration(data);
      setEditForm({ name: data.name, base_url: data.base_url, auth_header: '', is_active: data.is_active });
      const st = await (api as any).getSupplierSyncStatus(Number(id));
      setStatus(st);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await (api as any).getSupplierCategories(`integration=${id}&page_size=500`);
      setCategories(data.results || []);
      const cats = await (api as any).getCategories();
      setOurCategories(cats.results || cats || []);
    } catch { /* ignore */ }
  };

  const loadLogs = async () => {
    try {
      const data = await (api as any).getSupplierSyncLogs(`integration=${id}&page_size=50`);
      setSyncLogs(data.results || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadIntegration(); }, [id]);
  useEffect(() => {
    if (tab === 'mapping') loadCategories();
    if (tab === 'logs') loadLogs();
  }, [tab, id]);

  const handleSyncCatalog = async () => {
    try {
      setSyncingCatalog(true);
      await (api as any).syncSupplierCatalog(Number(id));
      toast.success('Импорт каталога запущен');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSyncingCatalog(false);
    }
  };

  const handleSyncStock = async () => {
    try {
      setSyncingStock(true);
      await (api as any).syncSupplierStock(Number(id));
      toast.success('Синхронизация остатков запущена');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSyncingStock(false);
    }
  };

  const handleSave = async () => {
    try {
      const payload: any = { name: editForm.name, base_url: editForm.base_url, is_active: editForm.is_active };
      if (editForm.auth_header) payload.auth_header = editForm.auth_header;
      await (api as any).updateSupplierIntegration(Number(id), payload);
      toast.success('Сохранено');
      setEditing(false);
      loadIntegration();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async () => {
    try {
      await (api as any).deleteSupplierIntegration(Number(id));
      toast.success('Интеграция удалена');
      navigate('/supply/integrations');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCategoryMapping = async (categoryId: number, ourCategoryId: number | null) => {
    try {
      await (api as any).updateSupplierCategoryMapping(categoryId, ourCategoryId);
      toast.success('Маппинг обновлён');
      loadCategories();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString('ru-RU') : '—';

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'success': return <Badge className="bg-green-100 text-green-700">Успешно</Badge>;
      case 'partial': return <Badge className="bg-yellow-100 text-yellow-700">Частично</Badge>;
      case 'failed': return <Badge variant="destructive">Ошибка</Badge>;
      case 'started': return <Badge className="bg-blue-100 text-blue-700">В процессе</Badge>;
      default: return <Badge variant="outline">{s}</Badge>;
    }
  };

  if (loading || !integration) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/supply/integrations')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-2xl font-bold">{integration.name}</h1>
          <Badge variant={integration.is_active ? 'default' : 'secondary'}>
            {integration.is_active ? 'Активна' : 'Неактивна'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSyncCatalog} disabled={syncingCatalog}>
            {syncingCatalog ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Синхр. каталог
          </Button>
          <Button variant="outline" onClick={handleSyncStock} disabled={syncingStock}>
            {syncingStock ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Синхр. остатки
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={t => setSearchParams({ tab: t })}>
        <TabsList>
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="mapping">Маппинг категорий</TabsTrigger>
          <TabsTrigger value="logs">Логи синхронизаций</TabsTrigger>
          <TabsTrigger value="settings">Настройки</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Товаров</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{status?.products_count ?? 0}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Категорий</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{status?.categories_count ?? 0}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Брендов</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{status?.brands_count ?? 0}</p></CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Последний импорт каталога</CardTitle></CardHeader>
              <CardContent>
                {status?.last_catalog_sync ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Статус</span>{getStatusBadge(status.last_catalog_sync.status)}</div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Обработано</span><span>{status.last_catalog_sync.items_processed}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Создано</span><span>{status.last_catalog_sync.items_created}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Обновлено</span><span>{status.last_catalog_sync.items_updated}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Ошибок</span><span>{status.last_catalog_sync.items_errors}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Длительность</span><span>{status.last_catalog_sync.duration_seconds ? `${status.last_catalog_sync.duration_seconds.toFixed(1)}с` : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Дата</span><span>{formatDate(status.last_catalog_sync.created_at)}</span></div>
                  </div>
                ) : <p className="text-muted-foreground">Не выполнялся</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Последняя синхр. остатков</CardTitle></CardHeader>
              <CardContent>
                {status?.last_stock_sync ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Статус</span>{getStatusBadge(status.last_stock_sync.status)}</div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Обработано</span><span>{status.last_stock_sync.items_processed}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Обновлено</span><span>{status.last_stock_sync.items_updated}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Ошибок</span><span>{status.last_stock_sync.items_errors}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Дата</span><span>{formatDate(status.last_stock_sync.created_at)}</span></div>
                  </div>
                ) : <p className="text-muted-foreground">Не выполнялась</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="mapping">
          <Card>
            <CardHeader>
              <CardTitle>Маппинг категорий поставщика → Наши категории</CardTitle>
            </CardHeader>
            <CardContent>
              {categories.length === 0 ? (
                <p className="text-muted-foreground">Категории не загружены. Сначала выполните синхронизацию каталога.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Категория поставщика</TableHead>
                      <TableHead>Наша категория</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map(cat => (
                      <TableRow key={cat.id}>
                        <TableCell className="font-medium">{cat.title}</TableCell>
                        <TableCell>
                          <Select
                            value={cat.our_category?.toString() || '_none'}
                            onValueChange={v => handleCategoryMapping(cat.id, v === '_none' ? null : Number(v))}
                          >
                            <SelectTrigger className="w-[300px]">
                              <SelectValue placeholder="Не привязана" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">Не привязана</SelectItem>
                              {ourCategories.map((c: any) => (
                                <SelectItem key={c.id} value={c.id.toString()}>{c.full_path || c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Логи синхронизаций</CardTitle>
                <Button variant="outline" size="sm" onClick={loadLogs}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Обновить
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {syncLogs.length === 0 ? (
                <p className="text-muted-foreground">Нет логов</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Обработано</TableHead>
                      <TableHead>Создано</TableHead>
                      <TableHead>Обновлено</TableHead>
                      <TableHead>Ошибок</TableHead>
                      <TableHead>Длительность</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncLogs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">{formatDate(log.created_at)}</TableCell>
                        <TableCell><Badge variant="outline">{log.sync_type_display}</Badge></TableCell>
                        <TableCell>{getStatusBadge(log.status)}</TableCell>
                        <TableCell>{log.items_processed}</TableCell>
                        <TableCell>{log.items_created}</TableCell>
                        <TableCell>{log.items_updated}</TableCell>
                        <TableCell>{log.items_errors > 0 ? <span className="text-red-600 font-medium">{log.items_errors}</span> : 0}</TableCell>
                        <TableCell>{log.duration_seconds ? `${log.duration_seconds.toFixed(1)}с` : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader><CardTitle>Настройки подключения</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Название</Label>
                <Input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <Label>URL API</Label>
                <Input value={editForm.base_url} onChange={e => setEditForm({ ...editForm, base_url: e.target.value })} />
              </div>
              <div>
                <Label>Authorization Header (оставьте пустым, чтобы не менять)</Label>
                <Input
                  type="password"
                  value={editForm.auth_header}
                  onChange={e => setEditForm({ ...editForm, auth_header: e.target.value })}
                  placeholder="Не изменять"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })}
                  className="rounded"
                  id="is_active"
                />
                <Label htmlFor="is_active">Активна</Label>
              </div>
              <div className="flex items-center gap-2 pt-4">
                <Button onClick={handleSave}>
                  <Save className="w-4 h-4 mr-1" /> Сохранить
                </Button>
                <Button variant="destructive" onClick={handleDelete}>
                  <Trash2 className="w-4 h-4 mr-1" /> Удалить интеграцию
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
