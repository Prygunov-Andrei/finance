import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Search, Loader2, Grid3X3, List, Package, ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import type { SupplierProduct, SupplierBrand, SupplierCategory } from '../../types/supplier';

export function SupplierCatalogPage() {
  const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [brands, setBrands] = useState<SupplierBrand[]>([]);
  const [categories, setCategories] = useState<SupplierCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [view, setView] = useState<'table' | 'cards'>(searchParams.get('view') as any || 'table');

  const search = searchParams.get('search') || '';
  const brandFilter = searchParams.get('brand') || '';
  const categoryFilter = searchParams.get('category') || '';
  const linkedFilter = searchParams.get('linked') || '';
  const inStockFilter = searchParams.get('in_stock') || '';
  const page = Number(searchParams.get('page') || '1');
  const pageSize = 50;

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page_size', String(pageSize));
    params.set('page', String(page));
    if (search) params.set('search', search);
    if (brandFilter) params.set('brand', brandFilter);
    if (categoryFilter) params.set('supplier_category', categoryFilter);
    if (linkedFilter) params.set('linked', linkedFilter);
    if (inStockFilter) params.set('in_stock', inStockFilter);
    return params.toString();
  }, [search, brandFilter, categoryFilter, linkedFilter, inStockFilter, page]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await (api as any).getSupplierProducts(buildParams());
      setProducts(data.results || []);
      setTotalCount(data.count || 0);
    } catch (err: any) {
      toast.error(`Ошибка загрузки: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadFilters = async () => {
    try {
      const [brandsData, catsData] = await Promise.all([
        (api as any).getSupplierBrands('page_size=500'),
        (api as any).getSupplierCategories('page_size=500'),
      ]);
      setBrands(brandsData.results || []);
      setCategories(catsData.results || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadFilters(); }, []);
  useEffect(() => { loadProducts(); }, [search, brandFilter, categoryFilter, linkedFilter, inStockFilter, page]);

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page'); // reset page
    setSearchParams(params);
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const formatPrice = (price: string | null, currency: string) => {
    if (!price) return '—';
    return `${Number(price).toLocaleString('ru-RU')} ${currency}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Каталог поставщика</h1>
          <p className="text-muted-foreground">{totalCount.toLocaleString()} товаров</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={view === 'table' ? 'default' : 'outline'} size="icon" onClick={() => setView('table')}>
            <List className="w-4 h-4" />
          </Button>
          <Button variant={view === 'cards' ? 'default' : 'outline'} size="icon" onClick={() => setView('cards')}>
            <Grid3X3 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Поиск по названию, артикулу, НС-коду..."
            value={search}
            onChange={e => updateFilter('search', e.target.value)}
          />
        </div>
        <Select value={brandFilter || '_all'} onValueChange={v => updateFilter('brand', v === '_all' ? '' : v)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Бренд" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Все бренды</SelectItem>
            {brands.map(b => <SelectItem key={b.id} value={b.id.toString()}>{b.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter || '_all'} onValueChange={v => updateFilter('category', v === '_all' ? '' : v)}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Категория" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Все категории</SelectItem>
            {categories.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={linkedFilter || '_all'} onValueChange={v => updateFilter('linked', v === '_all' ? '' : v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Привязка" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Все</SelectItem>
            <SelectItem value="true">Привязаны</SelectItem>
            <SelectItem value="false">Не привязаны</SelectItem>
          </SelectContent>
        </Select>
        <Select value={inStockFilter || '_all'} onValueChange={v => updateFilter('in_stock', v === '_all' ? '' : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Наличие" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Все</SelectItem>
            <SelectItem value="true">В наличии</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Товары не найдены</h3>
            <p className="text-muted-foreground">Измените фильтры или выполните синхронизацию каталога</p>
          </CardContent>
        </Card>
      ) : view === 'table' ? (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Фото</TableHead>
                <TableHead>Название</TableHead>
                <TableHead>Артикул</TableHead>
                <TableHead>НС-код</TableHead>
                <TableHead>Бренд</TableHead>
                <TableHead className="text-right">Закупочная</TableHead>
                <TableHead className="text-right">РИЦ</TableHead>
                <TableHead className="text-center">Наличие</TableHead>
                <TableHead>Наш товар</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map(p => (
                <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/supply/supplier-catalog/${p.id}`)}>
                  <TableCell>
                    {p.images?.[0] ? (
                      <img src={p.images[0]} alt="" className="w-10 h-10 object-cover rounded" />
                    ) : (
                      <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                        <Package className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium max-w-[300px] truncate">{p.title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.articul || '—'}</TableCell>
                  <TableCell className="text-xs font-mono">{p.nc_code}</TableCell>
                  <TableCell>{p.brand_name || '—'}</TableCell>
                  <TableCell className="text-right font-medium text-green-700">{formatPrice(p.base_price, p.base_price_currency)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatPrice(p.ric_price, p.ric_price_currency)}</TableCell>
                  <TableCell className="text-center">
                    {p.total_stock > 0 ? (
                      <Badge className="bg-green-100 text-green-700">{p.total_stock}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">0</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.product_name ? (
                      <span className="text-sm text-blue-600">{p.product_name}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {products.map(p => (
            <Card key={p.id} className="cursor-pointer hover:border-primary/50 transition-colors overflow-hidden" onClick={() => navigate(`/supply/supplier-catalog/${p.id}`)}>
              <div className="aspect-[4/3] bg-muted relative">
                {p.images?.[0] ? (
                  <img src={p.images[0]} alt="" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-12 h-12 text-muted-foreground/50" />
                  </div>
                )}
                <div className="absolute top-2 right-2 flex gap-1">
                  {p.total_stock > 0 && <Badge className="bg-green-600 text-white text-xs">{p.total_stock} шт</Badge>}
                  {p.product && <Badge className="bg-blue-600 text-white text-xs">Привязан</Badge>}
                </div>
              </div>
              <CardContent className="p-3">
                <p className="font-medium text-sm line-clamp-2 mb-1">{p.title}</p>
                <p className="text-xs text-muted-foreground mb-2">{p.articul || p.nc_code}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-green-700">{formatPrice(p.base_price, p.base_price_currency)}</span>
                  {p.ric_price && <span className="text-xs text-muted-foreground">{formatPrice(p.ric_price, p.ric_price_currency)}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              const params = new URLSearchParams(searchParams);
              params.set('page', String(page - 1));
              setSearchParams(params);
            }}
          >
            Назад
          </Button>
          <span className="text-sm text-muted-foreground">
            Страница {page} из {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => {
              const params = new URLSearchParams(searchParams);
              params.set('page', String(page + 1));
              setSearchParams(params);
            }}
          >
            Далее
          </Button>
        </div>
      )}
    </div>
  );
}
