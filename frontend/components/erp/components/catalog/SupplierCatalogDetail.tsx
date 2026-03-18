import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, FileText, Download, Play, Database, XCircle, Loader2, RefreshCw, BookOpen } from 'lucide-react';
import { api } from '@/lib/api';
import type { SupplierCatalog, SupplierCatalogSection } from '@/types/catalog';

// Статусы, при которых нужен polling
const POLLING_STATUSES = ['detecting_toc', 'parsing', 'importing'];

function getStatusBadge(status: string, statusDisplay: string) {
  const base = 'text-xs';
  switch (status) {
    case 'uploaded':
      return <Badge variant="outline" className={`${base} bg-gray-100 text-gray-700 border-gray-300`}>{statusDisplay}</Badge>;
    case 'detecting_toc':
      return <Badge className={`${base} bg-blue-100 text-blue-700 border-blue-300 animate-pulse`}>{statusDisplay}</Badge>;
    case 'toc_ready':
      return <Badge className={`${base} bg-cyan-100 text-cyan-700 border-cyan-300`}>{statusDisplay}</Badge>;
    case 'parsing':
      return <Badge className={`${base} bg-blue-100 text-blue-700 border-blue-300 animate-pulse`}>{statusDisplay}</Badge>;
    case 'parsed':
      return <Badge className={`${base} bg-green-100 text-green-700 border-green-300`}>{statusDisplay}</Badge>;
    case 'importing':
      return <Badge className={`${base} bg-blue-100 text-blue-700 border-blue-300 animate-pulse`}>{statusDisplay}</Badge>;
    case 'imported':
      return <Badge className={`${base} bg-emerald-100 text-emerald-700 border-emerald-300`}>{statusDisplay}</Badge>;
    case 'error':
      return <Badge variant="destructive" className={base}>{statusDisplay}</Badge>;
    default:
      return <Badge variant="outline" className={base}>{statusDisplay}</Badge>;
  }
}

export function SupplierCatalogDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [catalog, setCatalog] = useState<SupplierCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Редактируемые секции (локальная копия)
  const [editedSections, setEditedSections] = useState<SupplierCatalogSection[]>([]);
  const [sectionsChanged, setSectionsChanged] = useState(false);

  // Диалоги подтверждения (вместо browser native dialogs)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: '', description: '', onConfirm: () => {} });

  const catalogId = Number(id);

  const loadCatalog = useCallback(async () => {
    try {
      const data = await api.getSupplierCatalog(catalogId);
      setCatalog(data);
      // Обновляем секции только если пользователь не редактировал
      if (!sectionsChanged) {
        setEditedSections(data.sections || []);
      }
    } catch (err: any) {
      toast.error(`Ошибка загрузки каталога: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [catalogId, sectionsChanged]);

  // Первоначальная загрузка
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Polling при активных операциях
  useEffect(() => {
    if (!catalog || !POLLING_STATUSES.includes(catalog.status)) return;

    const interval = setInterval(() => {
      loadCatalog();
    }, 3000);

    return () => clearInterval(interval);
  }, [catalog?.status, loadCatalog]);

  // --- Обработчики секций ---

  const handleSectionChange = (index: number, field: keyof SupplierCatalogSection, value: any) => {
    setEditedSections(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setSectionsChanged(true);
  };

  const handlePageRangeChange = (index: number, pos: 0 | 1, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num) && value !== '') return;

    setEditedSections(prev => {
      const updated = [...prev];
      const pages: [number, number] = [...updated[index].pages];
      pages[pos] = num || 0;
      updated[index] = { ...updated[index], pages };
      return updated;
    });
    setSectionsChanged(true);
  };

  const saveSections = async () => {
    setActionLoading('save_sections');
    try {
      await api.updateCatalogSections(catalogId, editedSections);
      setSectionsChanged(false);
      toast.success('Секции сохранены');
      await loadCatalog();
    } catch (err: any) {
      toast.error(`Ошибка сохранения: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // --- Действия ---

  const handleDetectToc = async () => {
    setActionLoading('detect_toc');
    try {
      await api.detectCatalogToc(catalogId);
      toast.success('Определение оглавления запущено');
      await loadCatalog();
    } catch (err: any) {
      toast.error(`Ошибка: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleParse = async () => {
    setActionLoading('parse');
    try {
      await api.parseCatalog(catalogId);
      toast.success('Парсинг запущен');
      await loadCatalog();
    } catch (err: any) {
      toast.error(`Ошибка: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleImport = async () => {
    setConfirmDialog({
      open: true,
      title: 'Импортировать в базу данных?',
      description: 'Все распознанные товары, варианты и категории будут импортированы в каталог. Продолжить?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        setActionLoading('import');
        try {
          await api.importCatalogToDb(catalogId);
          toast.success('Импорт запущен');
          await loadCatalog();
        } catch (err: any) {
          toast.error(`Ошибка: ${err.message}`);
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleCancel = async () => {
    setConfirmDialog({
      open: true,
      title: 'Отменить текущую операцию?',
      description: 'Выполняемая задача будет прервана. Это действие нельзя отменить.',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        setActionLoading('cancel');
        try {
          await api.cancelCatalogTask(catalogId);
          toast.success('Операция отменена');
          await loadCatalog();
        } catch (err: any) {
          toast.error(`Ошибка: ${err.message}`);
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  // --- Рендер ---

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/catalog/supplier-catalogs')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Каталог не найден
          </CardContent>
        </Card>
      </div>
    );
  }

  const progressPercent = catalog.total_batches > 0
    ? Math.round((catalog.current_batch / catalog.total_batches) * 100)
    : 0;

  const isProcessing = POLLING_STATUSES.includes(catalog.status);
  const canDetectToc = ['uploaded', 'toc_ready', 'error'].includes(catalog.status);
  const canParse = editedSections.length > 0 && ['toc_ready', 'parsed', 'error'].includes(catalog.status);
  const canImport = catalog.status === 'parsed';
  const canCancel = ['detecting_toc', 'parsing', 'importing'].includes(catalog.status);

  return (
    <div className="space-y-6">
      {/* Шапка */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/catalog/supplier-catalogs')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold">{catalog.name}</h1>
              {getStatusBadge(catalog.status, catalog.status_display)}
            </div>
            <p className="text-muted-foreground">
              Поставщик: <span className="font-medium text-foreground">{catalog.supplier_name}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {catalog.pdf_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={catalog.pdf_url} target="_blank" rel="noopener noreferrer">
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </a>
            </Button>
          )}
          {catalog.json_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={catalog.json_url} target="_blank" rel="noopener noreferrer">
                <Download className="w-4 h-4 mr-2" />
                JSON
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Прогресс-бар при обработке */}
      {isProcessing && catalog.total_batches > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Обработка...
              </span>
              <span className="text-sm text-muted-foreground">
                {catalog.current_batch} / {catalog.total_batches} ({progressPercent}%)
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Ошибки */}
      {(catalog.error_message || (catalog.errors && catalog.errors.length > 0)) && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-700 text-base flex items-center gap-2">
              <XCircle className="w-5 h-5" />
              Ошибки
            </CardTitle>
          </CardHeader>
          <CardContent>
            {catalog.error_message && (
              <p className="text-sm text-red-700 mb-2">{catalog.error_message}</p>
            )}
            {catalog.errors && catalog.errors.length > 0 && (
              <ul className="list-disc list-inside space-y-1">
                {catalog.errors.map((err, i) => (
                  <li key={i} className="text-sm text-red-600">{err}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Всего страниц</p>
            <p className="text-2xl font-bold">{catalog.total_pages}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Товаров найдено</p>
            <p className="text-2xl font-bold">{catalog.products_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Вариантов найдено</p>
            <p className="text-2xl font-bold">{catalog.variants_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Импортировано</p>
            <p className="text-2xl font-bold">{catalog.imported_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Категорий создано</p>
            <p className="text-2xl font-bold">{catalog.categories_created}</p>
          </CardContent>
        </Card>
      </div>

      {/* Кнопки действий */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="outline"
          disabled={!canDetectToc || !!actionLoading}
          onClick={handleDetectToc}
        >
          {actionLoading === 'detect_toc' ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <BookOpen className="w-4 h-4 mr-2" />
          )}
          Определить оглавление
        </Button>

        <Button
          variant="outline"
          disabled={!canParse || !!actionLoading}
          onClick={handleParse}
        >
          {actionLoading === 'parse' ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Play className="w-4 h-4 mr-2" />
          )}
          Запустить парсинг
        </Button>

        <Button
          disabled={!canImport || !!actionLoading}
          onClick={handleImport}
        >
          {actionLoading === 'import' ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Database className="w-4 h-4 mr-2" />
          )}
          Импортировать в БД
        </Button>

        {canCancel && (
          <Button
            variant="destructive"
            disabled={!!actionLoading}
            onClick={handleCancel}
          >
            {actionLoading === 'cancel' ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <XCircle className="w-4 h-4 mr-2" />
            )}
            Отменить
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => loadCatalog()}
          disabled={!!actionLoading}
        >
          <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Таблица секций (оглавление) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Оглавление ({editedSections.length} секций)</CardTitle>
          {sectionsChanged && (
            <Button
              size="sm"
              onClick={saveSections}
              disabled={actionLoading === 'save_sections'}
            >
              {actionLoading === 'save_sections' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Сохранить изменения
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editedSections.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>Секции не определены</p>
              <p className="text-sm mt-1">Нажмите «Определить оглавление», чтобы автоматически найти разделы каталога</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Название секции</TableHead>
                    <TableHead className="w-32">Страницы (от)</TableHead>
                    <TableHead className="w-32">Страницы (до)</TableHead>
                    <TableHead className="w-48">Категория</TableHead>
                    <TableHead className="w-40">Статус категории</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editedSections.map((section, index) => (
                    <TableRow key={index}>
                      <TableCell className="text-muted-foreground font-mono text-sm">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={section.name}
                          onChange={e => handleSectionChange(index, 'name', e.target.value)}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={section.pages[0]}
                          onChange={e => handlePageRangeChange(index, 0, e.target.value)}
                          className="h-8 w-20"
                          min={1}
                          max={catalog.total_pages}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={section.pages[1]}
                          onChange={e => handlePageRangeChange(index, 1, e.target.value)}
                          className="h-8 w-20"
                          min={1}
                          max={catalog.total_pages}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={section.category_code}
                          onChange={e => handleSectionChange(index, 'category_code', e.target.value)}
                          className="h-8"
                          placeholder="Код категории"
                        />
                      </TableCell>
                      <TableCell>
                        {section.is_new_category ? (
                          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300 text-xs">
                            Будет создана
                          </Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">
                            Существует
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Диалог подтверждения */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => {
        if (!open) setConfirmDialog(prev => ({ ...prev, open: false }));
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
            <DialogDescription>{confirmDialog.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
            >
              Отмена
            </Button>
            <Button onClick={confirmDialog.onConfirm}>
              Подтвердить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
