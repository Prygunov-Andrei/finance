import type { PriceListList } from '@/lib/api';
import type { EstimateDetail } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, RefreshCw } from 'lucide-react';
import { UseMutationResult } from '@tanstack/react-query';

interface EstimateInfoTabProps {
  estimate: EstimateDetail;
  priceLists: PriceListList[] | undefined;
  updateFieldMutation: UseMutationResult<any, any, Record<string, unknown>, any>;
  updateStatusMutation: UseMutationResult<any, any, string, any>;
  fetchCBRMutation: UseMutationResult<any, any, void, any>;
}

const STATUS_MAP: Record<string, string> = {
  draft: 'Черновик',
  in_progress: 'В работе',
  checking: 'На проверке',
  approved: 'Утверждена',
  sent: 'Отправлена Заказчику',
  agreed: 'Согласована Заказчиком',
  rejected: 'Отклонена',
};

export function EstimateInfoTab({
  estimate,
  priceLists,
  updateFieldMutation,
  updateStatusMutation,
  fetchCBRMutation,
}: EstimateInfoTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <h3 className="font-semibold text-foreground mb-4">Основная информация</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">Номер</div>
            <div className="font-medium text-foreground">{estimate.number}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Название</div>
            <div className="font-medium text-foreground">{estimate.name}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Объект</div>
            <div className="font-medium text-foreground">{estimate.object_name}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Компания</div>
            <div className="font-medium text-foreground">{estimate.legal_entity_name}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Статус</div>
            <div>
              <select
                value={estimate.status}
                onChange={(e) => updateStatusMutation.mutate(e.target.value)}
                className="px-3 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {Object.entries(STATUS_MAP).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">С НДС</div>
            <div className="font-medium text-foreground">
              {estimate.with_vat ? `Да (${estimate.vat_rate}%)` : 'Нет'}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Создал</div>
            <div className="font-medium text-foreground">{estimate.created_by_username}</div>
          </div>
        </div>

        {estimate.projects.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="text-sm text-muted-foreground mb-2">Проекты-основания</div>
            <div className="space-y-3">
              {estimate.projects.map((project) => (
                <div key={project.id} className="border rounded-lg p-3">
                  <div className="font-medium text-sm text-foreground mb-2">
                    {project.cipher} — {project.name}
                  </div>
                  {project.project_files && project.project_files.length > 0 ? (
                    <div className="space-y-1 pl-2">
                      {project.project_files.map((pf) => (
                        <div key={pf.id} className="text-sm flex items-center gap-2">
                          <Badge variant="outline" className="text-xs shrink-0">{pf.file_type_name}</Badge>
                          <a
                            href={pf.file}
                            download
                            className="text-primary hover:underline inline-flex items-center gap-1 min-w-0"
                          >
                            <Download className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{pf.title || pf.original_filename}</span>
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : project.file ? (
                    <a
                      href={project.file}
                      download
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1 pl-2"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Файл проекта
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground pl-2">Файлы не прикреплены</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Editable parameters */}
      <div className="bg-card rounded-xl shadow-sm border border-border p-6" key={estimate.updated_at}>
        <h3 className="font-semibold text-foreground mb-4">Параметры сметы</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="detail-man-hours" className="text-sm text-muted-foreground">Человеко-часы</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                id="detail-man-hours"
                type="number"
                step="0.01"
                defaultValue={estimate.man_hours}
                onBlur={(e) => {
                  if (e.target.value !== estimate.man_hours) {
                    updateFieldMutation.mutate({ man_hours: e.target.value });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="max-w-[200px]"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="detail-price-list" className="text-sm text-muted-foreground">Прайс-лист для расчёта</Label>
            <select
              id="detail-price-list"
              defaultValue={estimate.price_list || ''}
              onChange={(e) => {
                const value = e.target.value ? Number(e.target.value) : null;
                updateFieldMutation.mutate({ price_list: value });
              }}
              className="mt-1 w-full max-w-[300px] px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            >
              <option value="">Не выбрано</option>
              {priceLists?.map((pl) => (
                <option key={pl.id} value={pl.id}>{pl.number} - {pl.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t">
          <Label className="text-sm text-muted-foreground">Наценки по умолчанию</Label>
          <div className="grid grid-cols-2 gap-3 mt-1 max-w-[400px]">
            <div>
              <Label htmlFor="detail-default-material-markup" className="text-xs text-muted-foreground">Наценка на материалы, %</Label>
              <Input
                id="detail-default-material-markup"
                type="number"
                step="0.01"
                placeholder="0"
                defaultValue={estimate.default_material_markup_percent || ''}
                onBlur={(e) => {
                  const newVal = e.target.value || undefined;
                  if (newVal !== (estimate.default_material_markup_percent || undefined)) {
                    updateFieldMutation.mutate({ default_material_markup_percent: newVal || null });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
            <div>
              <Label htmlFor="detail-default-work-markup" className="text-xs text-muted-foreground">Наценка на работы, %</Label>
              <Input
                id="detail-default-work-markup"
                type="number"
                step="0.01"
                placeholder="0"
                defaultValue={estimate.default_work_markup_percent || ''}
                onBlur={(e) => {
                  const newVal = e.target.value || undefined;
                  if (newVal !== (estimate.default_work_markup_percent || undefined)) {
                    updateFieldMutation.mutate({ default_work_markup_percent: newVal || null });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Курсы валют</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={() => fetchCBRMutation.mutate()}
              disabled={fetchCBRMutation.isPending}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${fetchCBRMutation.isPending ? 'animate-spin' : ''}`} />
              {fetchCBRMutation.isPending ? 'Загрузка...' : 'Курсы ЦБ'}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-1 max-w-[500px]">
            <div>
              <Label htmlFor="detail-usd" className="text-xs text-muted-foreground">USD</Label>
              <Input
                id="detail-usd"
                type="number"
                step="0.01"
                placeholder="—"
                defaultValue={estimate.usd_rate || ''}
                onBlur={(e) => {
                  const newVal = e.target.value || undefined;
                  if (newVal !== (estimate.usd_rate || undefined)) {
                    updateFieldMutation.mutate({ usd_rate: newVal || null });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
            <div>
              <Label htmlFor="detail-eur" className="text-xs text-muted-foreground">EUR</Label>
              <Input
                id="detail-eur"
                type="number"
                step="0.01"
                placeholder="—"
                defaultValue={estimate.eur_rate || ''}
                onBlur={(e) => {
                  const newVal = e.target.value || undefined;
                  if (newVal !== (estimate.eur_rate || undefined)) {
                    updateFieldMutation.mutate({ eur_rate: newVal || null });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
            <div>
              <Label htmlFor="detail-cny" className="text-xs text-muted-foreground">CNY</Label>
              <Input
                id="detail-cny"
                type="number"
                step="0.01"
                placeholder="—"
                defaultValue={estimate.cny_rate || ''}
                onBlur={(e) => {
                  const newVal = e.target.value || undefined;
                  if (newVal !== (estimate.cny_rate || undefined)) {
                    updateFieldMutation.mutate({ cny_rate: newVal || null });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
