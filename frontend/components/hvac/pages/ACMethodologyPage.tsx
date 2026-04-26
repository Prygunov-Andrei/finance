import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Info,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useHvacAuth as useAuth } from '../hooks/useHvacAuth';
import acRatingService from '../services/acRatingService';
import type {
  ACMethodology,
  ACMethodologyListItem,
} from '../services/acRatingTypes';

const formatDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('ru-RU') : '—';

export default function ACMethodologyPage() {
  const { user } = useAuth();
  const isAdmin = user?.is_staff === true;

  const [items, setItems] = useState<ACMethodologyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<ACMethodology | null>(
    null
  );
  const [detailLoading, setDetailLoading] = useState(false);

  const [activateId, setActivateId] = useState<number | null>(null);
  const [activating, setActivating] = useState(false);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await acRatingService.getMethodologies();
      setItems(list);
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      setError(
        status === 403
          ? 'Недостаточно прав для просмотра методики.'
          : 'Не удалось загрузить методику.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const toggleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedId(id);
    setExpandedDetail(null);
    setDetailLoading(true);
    try {
      const detail = await acRatingService.getMethodology(id);
      setExpandedDetail(detail);
    } catch {
      toast.error('Не удалось загрузить детали методики');
      setExpandedId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleActivate = async () => {
    if (activateId === null) return;
    setActivating(true);
    try {
      await acRatingService.activateMethodology(activateId);
      toast.success('Методика активирована');
      await loadItems();
      if (expandedId === activateId) {
        const detail = await acRatingService.getMethodology(activateId);
        setExpandedDetail(detail);
      }
    } catch (err: unknown) {
      const data = axios.isAxiosError(err)
        ? (err.response?.data as Record<string, unknown> | undefined)
        : undefined;
      const detailMsg =
        data && typeof data.detail === 'string' ? data.detail : null;
      toast.error(detailMsg || 'Не удалось активировать методику');
    } finally {
      setActivating(false);
      setActivateId(null);
    }
  };

  const activateTarget = items.find((m) => m.id === activateId) || null;

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1>Методика (рейтинг)</h1>
          {!loading && (
            <p className="text-sm text-muted-foreground mt-1">
              Версий: {items.length}
            </p>
          )}
        </div>

        <Card className="p-4 border-blue-200 bg-blue-50/40">
          <div className="flex items-start gap-2 text-sm">
            <Info className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
            <p className="text-blue-900">
              Создание новой версии и клонирование доступны через{' '}
              <a
                href="/admin/ac_methodology/methodologyversion/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline inline-flex items-center gap-0.5"
              >
                Django-admin
                <ExternalLink className="w-3 h-3" />
              </a>{' '}
              — это редкая операция (1–2 раза в год). Здесь — просмотр и
              активация существующих версий.
            </p>
          </div>
        </Card>

        {loading && (
          <Card className="p-12 text-center text-muted-foreground">
            Загрузка...
          </Card>
        )}

        {!loading && error && (
          <Card className="p-6 border-destructive bg-destructive/10">
            <p className="text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={loadItems}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Повторить
            </Button>
          </Card>
        )}

        {!loading && !error && items.length === 0 && (
          <Card className="p-12 text-center text-muted-foreground">
            Версий методики пока нет. Создайте первую через Django-admin.
          </Card>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="space-y-3">
            {items.map((m) => {
              const isExpanded = expandedId === m.id;
              const weightOk = Math.abs(m.weight_sum - 100) < 0.01;
              return (
                <Card
                  key={m.id}
                  className={`overflow-hidden ${
                    m.is_active ? 'border-emerald-300 bg-emerald-50/30' : ''
                  }`}
                  data-testid={`ac-methodology-card-${m.id}`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className="w-full text-left p-4 flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => toggleExpand(m.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpand(m.id);
                      }
                    }}
                    data-testid={`ac-methodology-toggle-${m.id}`}
                  >
                    <div className="flex items-start gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 mt-1 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 mt-1 text-muted-foreground" />
                      )}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium">{m.name}</h3>
                          <Badge variant="outline" className="font-mono">
                            v{m.version}
                          </Badge>
                          {m.is_active && (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Активна
                            </Badge>
                          )}
                          {!weightOk && (
                            <Badge
                              variant="outline"
                              className="border-amber-400 text-amber-700"
                            >
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Сумма весов {m.weight_sum.toFixed(2)}% ≠ 100%
                            </Badge>
                          )}
                          {m.needs_recalculation && (
                            <Badge
                              variant="outline"
                              className="border-amber-400 text-amber-700"
                            >
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Требуется пересчёт
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Критериев: {m.criteria_count} · Сумма весов:{' '}
                          {m.weight_sum.toFixed(2)}%
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Создана: {formatDate(m.created_at)} · Обновлена:{' '}
                          {formatDate(m.updated_at)}
                        </p>
                      </div>
                    </div>
                    {isAdmin && !m.is_active && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivateId(m.id);
                        }}
                        data-testid={`ac-methodology-activate-${m.id}`}
                      >
                        Активировать
                      </Button>
                    )}
                  </div>

                  {isExpanded && (
                    <div
                      className="border-t bg-muted/10 p-4"
                      data-testid={`ac-methodology-detail-${m.id}`}
                    >
                      {detailLoading && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Загрузка деталей...
                        </p>
                      )}
                      {!detailLoading && expandedDetail && (
                        <div className="space-y-3">
                          {expandedDetail.description && (
                            <p className="text-sm text-muted-foreground italic">
                              {expandedDetail.description}
                            </p>
                          )}
                          {expandedDetail.methodology_criteria.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              В этой версии нет критериев.
                            </p>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="font-mono text-xs">
                                    code
                                  </TableHead>
                                  <TableHead>Название</TableHead>
                                  <TableHead className="text-right">
                                    Вес
                                  </TableHead>
                                  <TableHead>Тип скоринга</TableHead>
                                  <TableHead>Регион</TableHead>
                                  <TableHead className="text-center">
                                    Public
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {expandedDetail.methodology_criteria
                                  .slice()
                                  .sort(
                                    (a, b) =>
                                      a.display_order - b.display_order
                                  )
                                  .map((mc) => (
                                    <TableRow key={mc.id}>
                                      <TableCell className="font-mono text-xs">
                                        {mc.criterion.code}
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {mc.criterion.name_ru}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums text-sm">
                                        {mc.weight.toFixed(2)}%
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground">
                                        {mc.scoring_type}
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground">
                                        {mc.region_scope}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        {mc.is_public ? (
                                          <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" />
                                        ) : (
                                          <span className="text-muted-foreground">
                                            —
                                          </span>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog
        open={activateId !== null}
        onOpenChange={(open) => !open && setActivateId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Активировать методику?</AlertDialogTitle>
            <AlertDialogDescription>
              {activateTarget && (
                <>
                  Версия <strong>{activateTarget.name}</strong> (v
                  {activateTarget.version}) станет активной. Текущая активная
                  версия будет деактивирована автоматически. Действие повлияет
                  на расчёт рейтинга на портале.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={activating}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleActivate}
              disabled={activating}
              data-testid="ac-methodology-activate-confirm"
            >
              {activating ? 'Активируем...' : 'Активировать'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
