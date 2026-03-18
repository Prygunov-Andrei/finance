import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Loader2, Package, Link2, ExternalLink, FileText, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import type { SupplierProduct } from '../../types/supplier';

export function SupplierProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
    const [product, setProduct] = useState<SupplierProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const loadProduct = async () => {
    try {
      setLoading(true);
      const data = await (api as any).getSupplierProduct(Number(id));
      setProduct(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProduct(); }, [id]);

  const formatPrice = (price: string | null, currency: string) => {
    if (!price) return '—';
    return `${Number(price).toLocaleString('ru-RU')} ${currency}`;
  };

  if (loading || !product) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalStock = product.stocks?.reduce((s, w) => s + w.quantity, 0) || 0;
  const techSpecs = product.tech_specs && typeof product.tech_specs === 'object' ? Object.entries(product.tech_specs) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/supply/supplier-catalog')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{product.title}</h1>
          <p className="text-sm text-muted-foreground">НС-код: {product.nc_code} | Артикул: {product.articul || '—'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Левая колонка — галерея + описание + ТХ */}
        <div className="lg:col-span-3 space-y-6">
          {/* Галерея */}
          {product.images && product.images.length > 0 ? (
            <Card>
              <CardContent className="p-4">
                <div
                  className="aspect-video bg-muted rounded-lg overflow-hidden cursor-pointer mb-3"
                  onClick={() => setImageDialogOpen(true)}
                >
                  <img src={product.images[selectedImage]} alt="" className="w-full h-full object-contain" />
                </div>
                {product.images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {product.images.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt=""
                        className={`w-16 h-16 object-cover rounded cursor-pointer border-2 ${i === selectedImage ? 'border-primary' : 'border-transparent'}`}
                        onClick={() => setSelectedImage(i)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Package className="w-16 h-16 text-muted-foreground/30" />
              </CardContent>
            </Card>
          )}

          {/* Описание */}
          {product.description && (
            <Card>
              <CardHeader><CardTitle className="text-base">Описание</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{product.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Технические характеристики */}
          {techSpecs.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Технические характеристики</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    {techSpecs.map(([key, value]) => (
                      <TableRow key={key}>
                        <TableCell className="font-medium text-muted-foreground w-1/3">{key}</TableCell>
                        <TableCell>{String(value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Документы */}
          {(product.booklet_url || product.manual_url) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Документация</CardTitle></CardHeader>
              <CardContent className="flex gap-3">
                {product.booklet_url && (
                  <Button variant="outline" asChild>
                    <a href={product.booklet_url} target="_blank" rel="noopener noreferrer">
                      <FileText className="w-4 h-4 mr-2" /> Буклет (PDF)
                    </a>
                  </Button>
                )}
                {product.manual_url && (
                  <Button variant="outline" asChild>
                    <a href={product.manual_url} target="_blank" rel="noopener noreferrer">
                      <FileText className="w-4 h-4 mr-2" /> Инструкция (PDF)
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Правая колонка — инфо, цены, остатки, привязка */}
        <div className="lg:col-span-2 space-y-4">
          {/* Цены */}
          <Card>
            <CardHeader><CardTitle className="text-base">Цены</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Закупочная</span>
                <span className="text-2xl font-bold text-green-700">{formatPrice(product.base_price, product.base_price_currency)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">РИЦ</span>
                <span className="text-lg text-muted-foreground">{formatPrice(product.ric_price, product.ric_price_currency)}</span>
              </div>
              {product.price_updated_at && (
                <p className="text-xs text-muted-foreground">Обновлено: {new Date(product.price_updated_at).toLocaleString('ru-RU')}</p>
              )}
            </CardContent>
          </Card>

          {/* Информация */}
          <Card>
            <CardHeader><CardTitle className="text-base">Информация</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Бренд</span><span className="font-medium">{product.brand_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Серия</span><span>{product.series || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Категория</span><span>{product.category_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Маркетплейс</span><span>{product.for_marketplace ? 'Да' : 'Нет'}</span></div>
            </CardContent>
          </Card>

          {/* Остатки по складам */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-base">Остатки</CardTitle>
                <Badge className={totalStock > 0 ? 'bg-green-100 text-green-700' : ''}>{totalStock} шт</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {product.stocks && product.stocks.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Склад</TableHead>
                      <TableHead className="text-right">Количество</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.stocks.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell>{s.warehouse_name}</TableCell>
                        <TableCell className="text-right font-medium">{s.quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-sm">Нет данных об остатках</p>
              )}
            </CardContent>
          </Card>

          {/* Привязка к нашему каталогу */}
          <Card>
            <CardHeader><CardTitle className="text-base">Привязка к каталогу</CardTitle></CardHeader>
            <CardContent>
              {product.product ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-blue-600">{product.product_name}</p>
                    <p className="text-xs text-muted-foreground">ID: {product.product}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/catalog/products/${product.product}`)}>
                    <ExternalLink className="w-4 h-4 mr-1" /> Открыть
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-muted-foreground mb-3">Товар не привязан к нашему каталогу</p>
                  <Button onClick={() => setLinkDialogOpen(true)}>
                    <Link2 className="w-4 h-4 mr-2" /> Привязать
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Диалог просмотра изображений */}
      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent className="max-w-4xl">
          <div className="relative">
            <img src={product.images?.[selectedImage]} alt="" className="w-full max-h-[70vh] object-contain" />
            {product.images && product.images.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2"
                  onClick={() => setSelectedImage(prev => (prev - 1 + product.images.length) % product.images.length)}
                >
                  <ChevronLeft className="w-6 h-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setSelectedImage(prev => (prev + 1) % product.images.length)}
                >
                  <ChevronRight className="w-6 h-6" />
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог привязки */}
      <LinkProductDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        supplierProductId={product.id}
        onLinked={() => { setLinkDialogOpen(false); loadProduct(); }}
      />
    </div>
  );
}

function LinkProductDialog({ open, onOpenChange, supplierProductId, onLinked }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierProductId: number;
  onLinked: () => void;
}) {
    const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);

  const handleSearch = async () => {
    if (!search.trim()) return;
    try {
      setLoading(true);
      const data = await (api as any).getProducts(`search=${encodeURIComponent(search)}&page_size=20`);
      setResults(data.results || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (search.length >= 2) {
      const timer = setTimeout(handleSearch, 300);
      return () => clearTimeout(timer);
    }
    setResults([]);
  }, [search]);

  const handleLink = async (productId: number) => {
    try {
      setLinking(true);
      await (api as any).linkSupplierProduct(supplierProductId, productId);
      toast.success('Товар привязан и обогащён');
      onLinked();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Привязать к нашему товару</DialogTitle>
          <DialogDescription>Найдите товар в каталоге для привязки</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Поиск по названию..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : results.length > 0 ? (
            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {results.map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer"
                  onClick={() => handleLink(p.id)}
                >
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.category_name || 'Без категории'} | {p.brand || '—'}</p>
                  </div>
                  <Button variant="ghost" size="sm" disabled={linking}>
                    <Link2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : search.length >= 2 ? (
            <p className="text-center text-muted-foreground py-4">Ничего не найдено</p>
          ) : (
            <p className="text-center text-muted-foreground py-4">Введите минимум 2 символа для поиска</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
