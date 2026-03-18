import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@/hooks/erp-router';
import { Upload, Loader2, Eye, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { CONSTANTS } from '../../constants';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BulkInvoiceUpload } from '../finance/BulkInvoiceUpload';

type EstimateSupplierInvoicesProps = {
  estimateId: number;
};

const statusBadge = (status: string) => {
  switch (status) {
    case 'recognition':
      return <Badge className="bg-purple-100 text-purple-800">Распознавание</Badge>;
    case 'review':
      return <Badge className="bg-yellow-100 text-yellow-800">На проверке</Badge>;
    case 'verified':
      return <Badge className="bg-green-100 text-green-800">Проверен</Badge>;
    case 'cancelled':
      return <Badge variant="destructive">Отменён</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
};

export const EstimateSupplierInvoices = ({ estimateId }: EstimateSupplierInvoicesProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isUploadOpen, setUploadOpen] = useState(false);

  const { data: invoicesResponse, isLoading } = useQuery({
    queryKey: ['estimate-invoices', estimateId],
    queryFn: () => (api as any).getInvoices(`estimate=${estimateId}`),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const invoices = invoicesResponse?.results || [];

  const stats = {
    total: invoices.length,
    recognition: invoices.filter((i: any) => i.status === 'recognition').length,
    review: invoices.filter((i: any) => i.status === 'review').length,
    verified: invoices.filter((i: any) => i.status === 'verified').length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Счета поставщиков</h3>
          {stats.total > 0 && (
            <>
              <Badge variant="secondary">{stats.total} счетов</Badge>
              {stats.recognition > 0 && (
                <Badge className="bg-purple-100 text-purple-800">
                  {stats.recognition} распознаётся
                </Badge>
              )}
              {stats.review > 0 && (
                <Badge className="bg-yellow-100 text-yellow-800">
                  {stats.review} на проверке
                </Badge>
              )}
              {stats.verified > 0 && (
                <Badge className="bg-green-100 text-green-800">
                  {stats.verified} проверено
                </Badge>
              )}
            </>
          )}
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Загрузить счета
        </Button>
      </div>

      {invoices.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Нет загруженных счетов поставщиков</p>
          <p className="text-sm mt-1">
            Загрузите счета или коммерческие предложения, чтобы система извлекла цены для сметы
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium">Статус</th>
                <th className="text-left px-4 py-3 font-medium">Номер</th>
                <th className="text-left px-4 py-3 font-medium">Контрагент</th>
                <th className="text-right px-4 py-3 font-medium">Сумма</th>
                <th className="text-left px-4 py-3 font-medium">Дата</th>
                <th className="text-right px-4 py-3 font-medium">Позиций</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice: any) => (
                <tr
                  key={invoice.id}
                  className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => navigate(`/estimates/invoices/${invoice.id}`)}
                >
                  <td className="px-4 py-3">{statusBadge(invoice.status)}</td>
                  <td className="px-4 py-3 font-medium">
                    {invoice.invoice_number || `#${invoice.id}`}
                  </td>
                  <td className="px-4 py-3">
                    {invoice.counterparty_name || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {invoice.amount_gross
                      ? Number(invoice.amount_gross).toLocaleString('ru-RU', {
                          style: 'currency',
                          currency: 'RUB',
                          maximumFractionDigits: 0,
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {invoice.invoice_date
                      ? new Date(invoice.invoice_date).toLocaleDateString('ru-RU')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {invoice.items_count ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BulkInvoiceUpload
        open={isUploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          if (!open) {
            queryClient.invalidateQueries({ queryKey: ['estimate-invoices', estimateId] });
          }
        }}
        estimateId={estimateId}
      />
    </div>
  );
};
