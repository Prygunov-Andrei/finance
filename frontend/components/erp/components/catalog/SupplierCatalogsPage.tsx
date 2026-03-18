import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Upload, FileText, Download, Trash2, Play, Database, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { SupplierCatalog, SupplierCatalogStatus } from '@/types/catalog';

const STATUS_CONFIG: Record<SupplierCatalogStatus, { label: string; className: string }> = {
  uploaded: { label: 'Загружен', className: 'bg-gray-100 text-gray-800' },
  detecting_toc: { label: 'Определение оглавления', className: 'bg-blue-100 text-blue-800' },
  toc_ready: { label: 'Оглавление готово', className: 'bg-cyan-100 text-cyan-800' },
  parsing: { label: 'Парсинг...', className: 'bg-blue-100 text-blue-800 animate-pulse' },
  parsed: { label: 'Распарсен', className: 'bg-green-100 text-green-800' },
  importing: { label: 'Импорт...', className: 'bg-blue-100 text-blue-800 animate-pulse' },
  imported: { label: 'Импортирован', className: 'bg-emerald-100 text-emerald-800' },
  error: { label: 'Ошибка', className: 'bg-red-100 text-red-800' },
};

export function SupplierCatalogsPage() {
  const navigate = useNavigate();

  const [catalogs, setCatalogs] = useState<SupplierCatalog[]>([]);
  const [loading, setLoading] = useState(true);

  // Диалог загрузки
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadSupplier, setUploadSupplier] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Диалог подтверждения удаления
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingCatalog, setDeletingCatalog] = useState<SupplierCatalog | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCatalogs = async () => {
    try {
      setLoading(true);
      const data = await api.getSupplierCatalogs();
      setCatalogs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(`Ошибка загрузки каталогов: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalogs();
  }, []);

  // Автообновление для активных задач
  useEffect(() => {
    const hasActive = catalogs.some(c =>
      ['detecting_toc', 'parsing', 'importing'].includes(c.status)
    );
    if (!hasActive) return;

    const interval = setInterval(loadCatalogs, 5000);
    return () => clearInterval(interval);
  }, [catalogs]);

  const resetUploadForm = () => {
    setUploadName('');
    setUploadSupplier('');
    setUploadFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!uploadName.trim()) {
      toast.error('Укажите название каталога');
      return;
    }
    if (!uploadFile) {
      toast.error('Выберите PDF-файл');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('name', uploadName.trim());
      if (uploadSupplier.trim()) {
        formData.append('supplier_name', uploadSupplier.trim());
      }
      formData.append('pdf_file', uploadFile);

      await api.uploadSupplierCatalog(formData);
      toast.success('Каталог загружен');
      setUploadOpen(false);
      resetUploadForm();
      loadCatalogs();
    } catch (err: any) {
      toast.error(`Ошибка загрузки: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCatalog) return;

    try {
      setDeleting(true);
      await api.deleteSupplierCatalog(deletingCatalog.id);
      toast.success('Каталог удалён');
      setDeleteOpen(false);
      setDeletingCatalog(null);
      loadCatalogs();
    } catch (err: any) {
      toast.error(`Ошибка удаления: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const openDeleteDialog = (catalog: SupplierCatalog, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingCatalog(catalog);
    setDeleteOpen(true);
  };

  const handleDownload = (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(url, '_blank');
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      setUploadFile(file);
    } else {
      toast.error('Допустимы только PDF-файлы');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: SupplierCatalogStatus) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.uploaded;
    return (
      <Badge variant="secondary" className={config.className}>
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Каталоги поставщиков</h1>
          <p className="text-muted-foreground">
            {catalogs.length > 0
              ? `${catalogs.length} каталог${catalogs.length === 1 ? '' : catalogs.length < 5 ? 'а' : 'ов'}`
              : 'Нет загруженных каталогов'}
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="w-4 h-4 mr-2" />
          Загрузить каталог
        </Button>
      </div>

      {/* Таблица каталогов */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : catalogs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Database className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Каталоги не найдены</h3>
            <p className="text-muted-foreground mb-4">
              Загрузите PDF-каталог поставщика для начала работы
            </p>
            <Button onClick={() => setUploadOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Загрузить каталог
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Поставщик</TableHead>
                <TableHead className="text-center">Страниц</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-center">Товаров</TableHead>
                <TableHead className="text-center">Вариантов</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {catalogs.map((catalog) => (
                <TableRow
                  key={catalog.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/catalog/supplier-catalogs/${catalog.id}`)}
                >
                  <TableCell className="font-medium max-w-[250px] truncate">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      {catalog.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {catalog.supplier_name || '—'}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {catalog.total_pages || '—'}
                  </TableCell>
                  <TableCell>{getStatusBadge(catalog.status)}</TableCell>
                  <TableCell className="text-center tabular-nums">
                    {catalog.products_count || 0}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {catalog.variants_count || 0}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {formatDate(catalog.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {catalog.pdf_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="Скачать PDF"
                          onClick={(e) => handleDownload(catalog.pdf_url!, e)}
                        >
                          <Download className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                      {catalog.json_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="Скачать JSON"
                          onClick={(e) => handleDownload(catalog.json_url!, e)}
                        >
                          <Download className="w-4 h-4 text-blue-500" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="Удалить"
                        onClick={(e) => openDeleteDialog(catalog, e)}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Диалог загрузки каталога */}
      <Dialog open={uploadOpen} onOpenChange={(open) => {
        setUploadOpen(open);
        if (!open) resetUploadForm();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Загрузить каталог поставщика</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="catalog-name">Название каталога</Label>
              <Input
                id="catalog-name"
                placeholder="Например: Каталог вентиляции 2026"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-name">Поставщик</Label>
              <Input
                id="supplier-name"
                placeholder="Название или код поставщика"
                value={uploadSupplier}
                onChange={(e) => setUploadSupplier(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>PDF-файл</Label>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  uploadFile
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/50'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {uploadFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium text-green-700">
                      {uploadFile.name}
                    </span>
                    <span className="text-xs text-green-500">
                      ({(uploadFile.size / 1024 / 1024).toFixed(1)} МБ)
                    </span>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600">
                      Перетащите PDF сюда или нажмите для выбора
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Поддерживается только формат PDF
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUploadOpen(false);
                resetUploadForm();
              }}
              disabled={uploading}
            >
              Отмена
            </Button>
            <Button onClick={handleUpload} disabled={uploading || !uploadName.trim() || !uploadFile}>
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Загрузка...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Загрузить
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог подтверждения удаления */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить каталог?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Каталог <strong>{deletingCatalog?.name}</strong> будет удалён вместе со всеми
            распарсенными данными. Это действие нельзя отменить.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Удаление...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Удалить
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
