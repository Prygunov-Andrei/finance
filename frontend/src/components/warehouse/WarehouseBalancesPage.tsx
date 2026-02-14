import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { kanbanApi, StockBalanceRow, StockLocation } from '../../lib/kanbanApi';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';

export const WarehouseBalancesPage = () => {
  const [locationId, setLocationId] = useState<string>('');

  const locationsQuery = useQuery({
    queryKey: ['warehouse', 'locations'],
    queryFn: () => kanbanApi.listStockLocations(),
  });

  const balancesQuery = useQuery({
    queryKey: ['warehouse', 'balances', locationId],
    enabled: Boolean(locationId),
    queryFn: () => kanbanApi.getBalances(locationId),
  });

  const locations = useMemo(() => (locationsQuery.data || []).slice().sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru')), [locationsQuery.data]);
  const rows: StockBalanceRow[] = balancesQuery.data?.results || [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold">Склад: остатки (V1)</h1>
        <div className="w-full sm:w-[420px]">
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger aria-label="Выбор локации">
              <SelectValue placeholder="Выберите локацию" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((loc: StockLocation) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.title} {loc.kind === 'object' && loc.erp_object_id ? `(объект #${loc.erp_object_id})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {locationsQuery.error ? (
        <Alert variant="destructive">
          <AlertDescription>Не удалось загрузить локации: {(locationsQuery.error as Error).message}</AlertDescription>
        </Alert>
      ) : null}

      {locationId && balancesQuery.error ? (
        <Alert variant="destructive">
          <AlertDescription>Не удалось загрузить остатки: {(balancesQuery.error as Error).message}</AlertDescription>
        </Alert>
      ) : null}

      {!locationId ? (
        <div className="text-muted-foreground">Выберите локацию, чтобы увидеть остатки.</div>
      ) : balancesQuery.isLoading ? (
        <div>Загрузка остатков...</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Товар</TableHead>
                <TableHead className="w-[120px]">Ед.</TableHead>
                <TableHead className="w-[120px] text-right">Кол-во</TableHead>
                <TableHead className="w-[120px]">Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.erp_product_id}-${r.unit}`}>
                  <TableCell className="font-medium">{r.product_name}</TableCell>
                  <TableCell>{r.unit}</TableCell>
                  <TableCell className="text-right">{r.qty}</TableCell>
                  <TableCell>
                    {r.ahhtung ? <Badge variant="destructive">ahhtung</Badge> : <Badge variant="secondary">ok</Badge>}
                  </TableCell>
                </TableRow>
              ))}

              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Нет данных
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

