'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, Eye, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { api } from '@/lib/api';
import { CONSTANTS, STATUS_LABELS, CAMPAIGN_STATUS_COLORS } from '@/constants';
import type { CampaignListItem, CampaignPreview } from '@/lib/api/types/marketing';
import { CampaignEditor } from './CampaignEditor';

export function CampaignsTab() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [previewData, setPreviewData] = useState<CampaignPreview | null>(null);
  const [previewCampaign, setPreviewCampaign] = useState<CampaignListItem | null>(null);
  const [sendConfirmId, setSendConfirmId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.marketing.getCampaigns(),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const sendMutation = useMutation({
    mutationFn: (id: number) => api.marketing.sendCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Рассылка запущена');
      setSendConfirmId(null);
    },
    onError: (err: Error) => toast.error(`Ошибка: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.marketing.deleteCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Рассылка удалена');
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(`Ошибка: ${err.message}`),
  });

  const handlePreview = async (campaign: CampaignListItem) => {
    try {
      const data = await api.marketing.previewCampaign(campaign.id);
      setPreviewData(data);
      setPreviewCampaign(campaign);
    } catch (err) {
      toast.error(`Ошибка: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Рассылки</h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Создать рассылку
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Нет рассылок. Создайте первую рассылку для монтажников.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Название</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Тип</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Статус</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Отправлено</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Ошибок</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Дата</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.map((c: CampaignListItem) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-sm">
                    <Badge variant="outline">{c.campaign_type === 'email' ? 'Email' : 'SMS'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={CAMPAIGN_STATUS_COLORS[c.status] || ''}>
                      {STATUS_LABELS[c.status] || c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm">{c.sent_count}/{c.total_recipients}</td>
                  <td className="px-4 py-3 text-sm">
                    {c.error_count > 0 && <span className="text-red-500">{c.error_count}</span>}
                    {c.error_count === 0 && <span className="text-muted-foreground">0</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {c.sent_at ? new Date(c.sent_at).toLocaleDateString('ru-RU') : new Date(c.created_at).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handlePreview(c)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      {c.status === 'draft' && (
                        <Button size="sm" variant="ghost" onClick={() => setSendConfirmId(c.id)}>
                          <Send className="w-4 h-4" />
                        </Button>
                      )}
                      {c.status === 'draft' && (
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => setDeleteId(c.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Campaign Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новая рассылка</DialogTitle>
          </DialogHeader>
          <CampaignEditor
            onSuccess={() => {
              setCreateOpen(false);
              queryClient.invalidateQueries({ queryKey: ['campaigns'] });
            }}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewData} onOpenChange={() => { setPreviewData(null); setPreviewCampaign(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Предпросмотр: {previewCampaign?.name}</DialogTitle>
          </DialogHeader>
          {previewData && (
            <div className="space-y-3">
              <div className="text-sm">
                <strong>Получателей:</strong> {previewData.total_recipients}
              </div>
              {previewData.estimated_sms_cost && (
                <div className="text-sm">
                  <strong>Примерная стоимость SMS:</strong> {previewData.estimated_sms_cost} руб
                </div>
              )}
              {previewData.recipients_preview.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Первые получатели:</h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {previewData.recipients_preview.map((r, i) => (
                      <div key={i} className="text-xs bg-muted/50 rounded p-2">
                        {r.counterparty__name} — {r.city || 'нет города'} — {r.email || r.phone || 'нет контакта'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Send Confirmation */}
      <AlertDialog open={sendConfirmId !== null} onOpenChange={() => setSendConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отправить рассылку?</AlertDialogTitle>
            <AlertDialogDescription>
              Рассылка будет отправлена всем подходящим получателям. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => sendConfirmId && sendMutation.mutate(sendConfirmId)}>
              Отправить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить рассылку?</AlertDialogTitle>
            <AlertDialogDescription>Черновик рассылки будет удалён.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
