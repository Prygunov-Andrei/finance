import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  Counterparty,
  CreateCounterpartyData,
  FNSReportListItem,
  FNSReport,
  FNSStats,
  FNSStatsMethod,
} from '../lib/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import {
  ArrowLeft,
  Loader2,
  Save,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  FileText,
  BarChart3,
  ScrollText,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Building2,
  User,
  MapPin,
  Calendar,
  Hash,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';

export function CounterpartyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const counterpartyId = Number(id);

  // Загрузка контрагента
  const { data: counterparty, isLoading, error } = useQuery({
    queryKey: ['counterparty', counterpartyId],
    queryFn: async () => {
      const all = await api.getCounterparties();
      return all.find((c) => c.id === counterpartyId) || null;
    },
    enabled: !!counterpartyId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !counterparty) {
    return (
      <div className="p-8">
        <div className="max-w-5xl mx-auto">
          <Button variant="ghost" onClick={() => navigate('/counterparties')} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Назад
          </Button>
          <div className="bg-red-50 text-red-600 p-6 rounded-xl">
            {error ? `Ошибка: ${(error as Error).message}` : 'Контрагент не найден'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/counterparties')} size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" /> Контрагенты
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">{counterparty.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span className="font-mono">ИНН: {counterparty.inn}</span>
              {counterparty.kpp && <span className="font-mono">КПП: {counterparty.kpp}</span>}
              {counterparty.ogrn && <span className="font-mono">ОГРН: {counterparty.ogrn}</span>}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="main" className="w-full">
          <TabsList className="flex w-full flex-wrap mb-6">
            <TabsTrigger value="main">
              <Building2 className="w-4 h-4 mr-1.5" /> Основное
            </TabsTrigger>
            <TabsTrigger value="fns-check">
              <ShieldCheck className="w-4 h-4 mr-1.5" /> Проверка ФНС
            </TabsTrigger>
            <TabsTrigger value="fns-bo">
              <BarChart3 className="w-4 h-4 mr-1.5" /> Бух. отчетность
            </TabsTrigger>
            <TabsTrigger value="contracts">
              <ScrollText className="w-4 h-4 mr-1.5" /> Договоры
            </TabsTrigger>
          </TabsList>

          <TabsContent value="main">
            <MainTab counterparty={counterparty} />
          </TabsContent>

          <TabsContent value="fns-check">
            <FNSCheckTab counterpartyId={counterpartyId} inn={counterparty.inn} />
          </TabsContent>

          <TabsContent value="fns-bo">
            <FNSFinanceTab counterpartyId={counterpartyId} inn={counterparty.inn} />
          </TabsContent>

          <TabsContent value="contracts">
            <ContractsTab counterpartyId={counterpartyId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Вкладка "Основное" ─────────────────────────────────────────

function MainTab({ counterparty }: { counterparty: Counterparty }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<CreateCounterpartyData>>({
    name: counterparty.name,
    short_name: counterparty.short_name || '',
    inn: counterparty.inn,
    kpp: counterparty.kpp || '',
    ogrn: counterparty.ogrn || '',
    type: counterparty.type,
    vendor_subtype: counterparty.vendor_subtype,
    legal_form: counterparty.legal_form || 'ooo',
    address: counterparty.address || '',
    contact_info: counterparty.contact_info || '',
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateCounterpartyData>) =>
      api.updateCounterparty(counterparty.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counterparty', counterparty.id] });
      queryClient.invalidateQueries({ queryKey: ['counterparties'] });
      setIsEditing(false);
      toast.success('Контрагент обновлен');
    },
    onError: (e: any) => toast.error(`Ошибка: ${e?.message}`),
  });

  const handleSave = () => {
    updateMutation.mutate({
      ...formData,
      vendor_subtype: (formData.type === 'vendor' || formData.type === 'both')
        ? formData.vendor_subtype : undefined,
    });
  };

  const getLegalFormLabel = (f?: string) => {
    const map: Record<string, string> = { ooo: 'ООО', ip: 'ИП', fiz: 'Физ.лицо', self_employed: 'Самозанятый' };
    return map[f || ''] || f || '—';
  };

  const getTypeLabel = (t: string) => {
    const map: Record<string, string> = { customer: 'Заказчик', vendor: 'Исполнитель-Поставщик', both: 'Заказчик и Исполнитель' };
    return map[t] || t;
  };

  if (!isEditing) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Реквизиты</h2>
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            Редактировать
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow label="Полное наименование" value={counterparty.name} />
          <InfoRow label="Краткое наименование" value={counterparty.short_name || '—'} />
          <InfoRow label="ИНН" value={counterparty.inn} mono />
          <InfoRow label="КПП" value={counterparty.kpp || '—'} mono />
          <InfoRow label="ОГРН" value={counterparty.ogrn || '—'} mono />
          <InfoRow label="Правовая форма" value={getLegalFormLabel(counterparty.legal_form)} />
          <InfoRow label="Тип" value={getTypeLabel(counterparty.type)} />
          {counterparty.vendor_subtype && (
            <InfoRow label="Подтип" value={counterparty.vendor_subtype === 'supplier' ? 'Поставщик' : counterparty.vendor_subtype === 'executor' ? 'Исполнитель' : 'Исполнитель и Поставщик'} />
          )}
          <div className="md:col-span-2">
            <InfoRow label="Юридический адрес" value={counterparty.address || '—'} />
          </div>
          <div className="md:col-span-2">
            <InfoRow label="Контакты" value={counterparty.contact_info || '—'} />
          </div>
        </div>
      </div>
    );
  }

  // Режим редактирования
  const showVendorSubtype = formData.type === 'vendor' || formData.type === 'both';
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Редактирование</h2>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>Отмена</Button>
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
            {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Сохранить
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Полное наименование</Label>
          <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label>Краткое наименование</Label>
          <Input value={formData.short_name} onChange={(e) => setFormData({ ...formData, short_name: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label>ИНН</Label>
          <Input value={formData.inn} onChange={(e) => setFormData({ ...formData, inn: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label>КПП</Label>
          <Input value={formData.kpp} onChange={(e) => setFormData({ ...formData, kpp: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label>ОГРН</Label>
          <Input value={formData.ogrn} onChange={(e) => setFormData({ ...formData, ogrn: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label>Правовая форма</Label>
          <Select value={formData.legal_form} onValueChange={(v: any) => setFormData({ ...formData, legal_form: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ooo">ООО</SelectItem>
              <SelectItem value="ip">ИП</SelectItem>
              <SelectItem value="fiz">Физ.лицо</SelectItem>
              <SelectItem value="self_employed">Самозанятый</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Тип</Label>
          <Select value={formData.type} onValueChange={(v: any) => setFormData({ ...formData, type: v, vendor_subtype: v === 'customer' ? null : formData.vendor_subtype })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="customer">Заказчик</SelectItem>
              <SelectItem value="vendor">Исполнитель-Поставщик</SelectItem>
              <SelectItem value="both">Заказчик и Исполнитель</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {showVendorSubtype && (
          <div>
            <Label>Подтип</Label>
            <Select value={formData.vendor_subtype || 'null'} onValueChange={(v: any) => setFormData({ ...formData, vendor_subtype: v === 'null' ? null : v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="null">Не указано</SelectItem>
                <SelectItem value="supplier">Поставщик</SelectItem>
                <SelectItem value="executor">Исполнитель</SelectItem>
                <SelectItem value="both">Исполнитель и Поставщик</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="md:col-span-2">
          <Label>Юридический адрес</Label>
          <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="mt-1" />
        </div>
        <div className="md:col-span-2">
          <Label>Контакты</Label>
          <Textarea value={formData.contact_info} onChange={(e) => setFormData({ ...formData, contact_info: e.target.value })} className="mt-1" rows={3} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`text-sm ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

// ─── Вкладка "Проверка ФНС" ────────────────────────────────────

function FNSCheckTab({ counterpartyId, inn }: { counterpartyId: number; inn: string }) {
  const queryClient = useQueryClient();
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  // Статистика API
  const { data: stats } = useQuery({
    queryKey: ['fns-stats'],
    queryFn: () => api.fnsGetStats(),
    staleTime: 5 * 60_000,
  });

  // Список отчетов
  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ['fns-reports', counterpartyId],
    queryFn: () => api.fnsGetReports({ counterparty: counterpartyId }),
  });

  // Детали выбранного отчета
  const { data: reportDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['fns-report', selectedReportId],
    queryFn: () => api.fnsGetReport(selectedReportId!),
    enabled: !!selectedReportId,
  });

  // Создание отчетов
  const createMutation = useMutation({
    mutationFn: (types: string[]) => api.fnsCreateReports(counterpartyId, types),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fns-reports', counterpartyId] });
      queryClient.invalidateQueries({ queryKey: ['fns-stats'] });
      toast.success(`Создано отчетов: ${data.created_count}`);
      if (data.errors?.length) {
        data.errors.forEach((e) => toast.error(`${e.report_type}: ${e.error}`));
      }
    },
    onError: (e: any) => toast.error(`Ошибка: ${e?.message}`),
  });

  const [selectedTypes, setSelectedTypes] = useState<string[]>(['check', 'egr']);

  const handleToggleType = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const checkReports = (reports || []).filter((r) => r.report_type === 'check');
  const egrReports = (reports || []).filter((r) => r.report_type === 'egr');

  return (
    <div className="space-y-6">
      {/* Бейдж статистики */}
      {stats?.is_configured && (
        <FNSStatsBadge stats={stats} />
      )}

      {/* Кнопка запуска проверки */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Запустить проверку</h3>
        <div className="flex flex-wrap gap-3 mb-4">
          {[
            { id: 'check', label: 'Проверка контрагента', icon: ShieldCheck },
            { id: 'egr', label: 'Данные ЕГРЮЛ', icon: FileText },
            { id: 'bo', label: 'Бух. отчетность', icon: BarChart3 },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleToggleType(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors ${
                selectedTypes.includes(id)
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
        <Button
          onClick={() => createMutation.mutate(selectedTypes)}
          disabled={createMutation.isPending || selectedTypes.length === 0}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {createMutation.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Формирование...</>
          ) : (
            <><RefreshCw className="w-4 h-4 mr-2" /> Сформировать отчеты ({selectedTypes.length})</>
          )}
        </Button>
      </div>

      {/* Результаты check */}
      {checkReports.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Проверка контрагента</h3>
          {checkReports.map((report) => (
            <CheckReportCard key={report.id} report={report} onViewDetail={() => setSelectedReportId(report.id)} />
          ))}
        </div>
      )}

      {/* Результаты egr */}
      {egrReports.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Данные ЕГРЮЛ/ЕГРИП</h3>
          {egrReports.map((report) => (
            <EgrReportCard key={report.id} report={report} onViewDetail={() => setSelectedReportId(report.id)} />
          ))}
        </div>
      )}

      {/* История всех отчетов */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">История отчетов</h3>
        {reportsLoading ? (
          <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Загрузка...</div>
        ) : !reports || reports.length === 0 ? (
          <p className="text-sm text-gray-500">Отчетов пока нет. Нажмите «Сформировать отчеты» выше.</p>
        ) : (
          <div className="space-y-2">
            {reports.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setSelectedReportId(report.id)}
                tabIndex={0}
                role="button"
                aria-label={`Открыть отчет ${report.report_type_display}`}
                onKeyDown={(e) => { if (e.key === 'Enter') setSelectedReportId(report.id); }}
              >
                <div className="flex items-center gap-3">
                  <ReportTypeIcon type={report.report_type} />
                  <div>
                    <div className="text-sm font-medium">{report.report_type_display}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(report.report_date).toLocaleString('ru-RU')}
                      {report.requested_by_username && ` — ${report.requested_by_username}`}
                    </div>
                  </div>
                </div>
                {report.report_type === 'check' && report.summary && (
                  <RiskBadge summary={report.summary} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Модальное окно деталей отчета */}
      <Dialog open={!!selectedReportId} onOpenChange={(open) => { if (!open) setSelectedReportId(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {reportDetail?.report_type_display || 'Отчет ФНС'}
            </DialogTitle>
            <DialogDescription>
              ИНН: {reportDetail?.inn} | {reportDetail?.report_date && new Date(reportDetail.report_date).toLocaleString('ru-RU')}
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : reportDetail ? (
            <ReportDetailView report={reportDetail} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Компоненты отчетов ─────────────────────────────────────────

function ReportTypeIcon({ type }: { type: string }) {
  if (type === 'check') return <ShieldCheck className="w-5 h-5 text-blue-500" />;
  if (type === 'egr') return <FileText className="w-5 h-5 text-purple-500" />;
  if (type === 'bo') return <BarChart3 className="w-5 h-5 text-green-500" />;
  return <FileText className="w-5 h-5 text-gray-400" />;
}

function RiskBadge({ summary }: { summary: Record<string, unknown> }) {
  const risk = (summary.risk_level as string) || 'unknown';
  const cls = risk === 'low' ? 'bg-green-100 text-green-700'
    : risk === 'medium' ? 'bg-yellow-100 text-yellow-700'
    : risk === 'high' ? 'bg-red-100 text-red-700'
    : 'bg-gray-100 text-gray-500';
  const label = risk === 'low' ? 'Низкий риск'
    : risk === 'medium' ? 'Средний риск'
    : risk === 'high' ? 'Высокий риск'
    : '—';
  return <span className={`px-2 py-0.5 text-xs font-medium rounded ${cls}`}>{label}</span>;
}

function CheckReportCard({ report, onViewDetail }: { report: FNSReportListItem; onViewDetail: () => void }) {
  const summary = report.summary as { positive?: string[]; negative?: string[]; risk_level?: string } | null;
  if (!summary) return null;

  const positive = summary.positive || [];
  const negative = summary.negative || [];

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-gray-500">
          {new Date(report.report_date).toLocaleString('ru-RU')}
        </div>
        <Button variant="ghost" size="sm" onClick={onViewDetail} className="text-xs">
          Подробнее
        </Button>
      </div>

      {negative.length > 0 && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-1.5 text-red-700 text-sm font-medium mb-2">
            <XCircle className="w-4 h-4" /> Негативные факторы ({negative.length})
          </div>
          <ul className="space-y-1">
            {negative.map((item, i) => (
              <li key={i} className="text-xs text-red-600">- {item}</li>
            ))}
          </ul>
        </div>
      )}

      {positive.length > 0 && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-1.5 text-green-700 text-sm font-medium mb-2">
            <CheckCircle2 className="w-4 h-4" /> Позитивные факторы ({positive.length})
          </div>
          <ul className="space-y-1">
            {positive.map((item, i) => (
              <li key={i} className="text-xs text-green-600">+ {item}</li>
            ))}
          </ul>
        </div>
      )}

      {negative.length === 0 && positive.length === 0 && (
        <p className="text-sm text-gray-500">Нет данных для отображения</p>
      )}
    </div>
  );
}

function EgrReportCard({ report, onViewDetail }: { report: FNSReportListItem; onViewDetail: () => void }) {
  return (
    <div className="flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded-lg mb-2 last:mb-0">
      <div>
        <div className="text-sm font-medium text-purple-700">Выписка ЕГРЮЛ/ЕГРИП</div>
        <div className="text-xs text-purple-500">
          {new Date(report.report_date).toLocaleString('ru-RU')}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onViewDetail} className="text-xs">
        Просмотреть
      </Button>
    </div>
  );
}

function ReportDetailView({ report }: { report: FNSReport }) {
  const [isRawExpanded, setIsRawExpanded] = useState(false);

  return (
    <div className="space-y-4">
      {/* Summary для check */}
      {report.report_type === 'check' && report.summary && (
        <div className="space-y-3">
          {(report.summary as any).negative?.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-sm font-medium text-red-700 mb-2">Негативные факторы</div>
              {((report.summary as any).negative as string[]).map((item, i) => (
                <div key={i} className="text-xs text-red-600 mb-0.5">- {item}</div>
              ))}
            </div>
          )}
          {(report.summary as any).positive?.length > 0 && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="text-sm font-medium text-green-700 mb-2">Позитивные факторы</div>
              {((report.summary as any).positive as string[]).map((item, i) => (
                <div key={i} className="text-xs text-green-600 mb-0.5">+ {item}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* EGR structured data */}
      {report.report_type === 'egr' && report.data && (
        <EgrStructuredView data={report.data} />
      )}

      {/* BO structured data */}
      {report.report_type === 'bo' && report.data && (
        <BoStructuredView data={report.data} />
      )}

      {/* Raw JSON */}
      <div className="border border-gray-200 rounded-lg">
        <button
          type="button"
          className="w-full flex items-center justify-between p-3 text-sm text-gray-600 hover:bg-gray-50"
          onClick={() => setIsRawExpanded(!isRawExpanded)}
        >
          <span>Исходный JSON</span>
          {isRawExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {isRawExpanded && (
          <pre className="p-3 bg-gray-50 text-xs overflow-x-auto max-h-96 border-t">
            {JSON.stringify(report.data, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function EgrStructuredView({ data }: { data: Record<string, unknown> }) {
  const items = (data as any).items || [];
  if (items.length === 0) return <p className="text-sm text-gray-500">Нет данных ЕГРЮЛ</p>;

  const company = items[0] || {};

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {company['НаимПолнЮЛ'] && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 flex items-center gap-1"><Building2 className="w-3 h-3" /> Полное наименование</div>
            <div className="text-sm mt-1">{company['НаимПолнЮЛ']}</div>
          </div>
        )}
        {company['АдресПолн'] && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> Адрес</div>
            <div className="text-sm mt-1">{company['АдресПолн']}</div>
          </div>
        )}
        {company['ДатаРег'] && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> Дата регистрации</div>
            <div className="text-sm mt-1">{company['ДатаРег']}</div>
          </div>
        )}
        {company['Статус'] && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 flex items-center gap-1"><Hash className="w-3 h-3" /> Статус</div>
            <div className="text-sm mt-1">{company['Статус']}</div>
          </div>
        )}
        {company['ОснВидДеят'] && (
          <div className="p-3 bg-gray-50 rounded-lg md:col-span-2">
            <div className="text-xs text-gray-500">Основной вид деятельности</div>
            <div className="text-sm mt-1">{company['ОснВидДеят']}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function BoStructuredView({ data }: { data: Record<string, unknown> }) {
  const items = (data as any).items || [];
  if (items.length === 0) return <p className="text-sm text-gray-500">Нет бухгалтерской отчетности</p>;

  const company = items[0] || {};
  const bo = company['БухОтworking'] || company['БухОтч'] || {};

  // Попробуем извлечь данные по годам
  const years = Object.keys(bo).filter((k) => /^\d{4}$/.test(k)).sort().reverse();

  if (years.length === 0) {
    return <p className="text-sm text-gray-500">Данные бухгалтерской отчетности не найдены в ответе</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-3 text-xs text-gray-500">Показатель</th>
            {years.map((y) => (
              <th key={y} className="text-right py-2 px-3 text-xs text-gray-500">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {['2110', '2120', '2200', '2300', '2400'].map((code) => {
            const labels: Record<string, string> = {
              '2110': 'Выручка',
              '2120': 'Себестоимость',
              '2200': 'Прибыль от продаж',
              '2300': 'Прибыль до налогов',
              '2400': 'Чистая прибыль',
            };
            return (
              <tr key={code} className="border-b last:border-0">
                <td className="py-2 px-3 text-gray-700">{labels[code] || code}</td>
                {years.map((y) => {
                  const yearData = (bo as any)[y] || {};
                  const val = yearData[code];
                  return (
                    <td key={y} className="py-2 px-3 text-right font-mono text-gray-600">
                      {val !== undefined ? Number(val).toLocaleString('ru-RU') : '—'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Бейдж статистики API-FNS ───────────────────────────────────

function FNSStatsBadge({ stats }: { stats: FNSStats }) {
  const keyMethods = stats.methods.filter((m) =>
    ['search', 'check', 'egr', 'bo'].includes(m.name)
  );

  if (keyMethods.length === 0) return null;

  const minRatio = Math.min(...keyMethods.map((m) => m.limit > 0 ? m.remaining / m.limit : 1));
  const badgeColor = minRatio > 0.5 ? 'bg-green-50 border-green-200 text-green-700'
    : minRatio > 0.1 ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
    : 'bg-red-50 border-red-200 text-red-700';

  return (
    <div className={`flex flex-wrap items-center gap-3 px-4 py-2 rounded-lg border text-xs ${badgeColor}`}>
      <span className="font-medium">Остаток запросов:</span>
      {keyMethods.map((m) => (
        <span key={m.name} className="font-mono">
          {m.display_name} {m.remaining}/{m.limit}
        </span>
      ))}
      <span className="ml-auto opacity-60">Ключ: {stats.status}</span>
    </div>
  );
}

// ─── Вкладка "Бух. отчетность" ─────────────────────────────────

function FNSFinanceTab({ counterpartyId, inn }: { counterpartyId: number; inn: string }) {
  const queryClient = useQueryClient();

  const { data: reports, isLoading } = useQuery({
    queryKey: ['fns-reports-bo', counterpartyId],
    queryFn: () => api.fnsGetReports({ counterparty: counterpartyId, report_type: 'bo' }),
  });

  const createMutation = useMutation({
    mutationFn: () => api.fnsCreateReports(counterpartyId, ['bo']),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fns-reports-bo', counterpartyId] });
      queryClient.invalidateQueries({ queryKey: ['fns-reports', counterpartyId] });
      queryClient.invalidateQueries({ queryKey: ['fns-stats'] });
      toast.success('Бухгалтерская отчетность загружена');
    },
    onError: (e: any) => toast.error(`Ошибка: ${e?.message}`),
  });

  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  const { data: reportDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['fns-report', selectedReportId],
    queryFn: () => api.fnsGetReport(selectedReportId!),
    enabled: !!selectedReportId,
  });

  const latestReport = reports?.[0];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Бухгалтерская отчетность</h3>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            variant="outline"
            size="sm"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Загрузить из ФНС
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Загрузка...</div>
        ) : !reports || reports.length === 0 ? (
          <p className="text-sm text-gray-500">
            Бухгалтерская отчетность ещё не загружена. Нажмите «Загрузить из ФНС».
            <br />
            <span className="text-xs text-gray-400">Доступна только для юридических лиц (ООО, АО и т.д.)</span>
          </p>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedReportId(report.id)}
                tabIndex={0}
                role="button"
                aria-label="Открыть бухгалтерскую отчетность"
                onKeyDown={(e) => { if (e.key === 'Enter') setSelectedReportId(report.id); }}
              >
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-5 h-5 text-green-500" />
                  <div>
                    <div className="text-sm font-medium">Бухгалтерская отчетность</div>
                    <div className="text-xs text-gray-500">{new Date(report.report_date).toLocaleString('ru-RU')}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Модальное окно */}
      <Dialog open={!!selectedReportId} onOpenChange={(open) => { if (!open) setSelectedReportId(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Бухгалтерская отчетность</DialogTitle>
            <DialogDescription>ИНН: {inn}</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : reportDetail ? (
            <ReportDetailView report={reportDetail} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Вкладка "Договоры" ─────────────────────────────────────────

function ContractsTab({ counterpartyId }: { counterpartyId: number }) {
  const navigate = useNavigate();

  const { data: contracts, isLoading } = useQuery({
    queryKey: ['contracts', { counterparty: counterpartyId }],
    queryFn: async () => {
      const response = await api.getContracts();
      const results = response?.results || [];
      return results.filter((c: any) => c.counterparty === counterpartyId);
    },
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">Договоры</h3>
      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Загрузка...</div>
      ) : !contracts || contracts.length === 0 ? (
        <p className="text-sm text-gray-500">Нет договоров с этим контрагентом</p>
      ) : (
        <div className="space-y-2">
          {contracts.map((contract: any) => (
            <div
              key={contract.id}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer"
              onClick={() => navigate(`/contracts/${contract.id}`)}
              tabIndex={0}
              role="button"
              aria-label={`Открыть договор ${contract.number || contract.id}`}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/contracts/${contract.id}`); }}
            >
              <div>
                <div className="text-sm font-medium">{contract.number || `Договор #${contract.id}`}</div>
                <div className="text-xs text-gray-500">{contract.name || contract.subject || ''}</div>
              </div>
              <div className="text-xs text-gray-400">
                {contract.date && new Date(contract.date).toLocaleDateString('ru-RU')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
