import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { BitrixIntegration } from '../../types/supply';
import {
  Loader2, Plus, Pencil, Trash2, Link2, Check, ExternalLink, Copy,
  AlertCircle, CheckCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog';
import { toast } from 'sonner';
import { formatDate } from '../../lib/utils';
import { CONSTANTS } from '../../constants';

export function BitrixSettingsPage() {
  const queryClient = useQueryClient();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    portal_url: '',
    webhook_url: '',
    outgoing_webhook_token: '',
    target_category_id: '0',
    target_stage_id: '',
    contract_field_mapping: '',
    object_field_mapping: '',
    is_active: true,
  });

  const { data: integrations, isLoading } = useQuery<BitrixIntegration[]>({
    queryKey: ['bitrix-integrations'],
    queryFn: () => (api as any).getBitrixIntegrations(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => (api as any).createBitrixIntegration(data),
    onSuccess: () => {
      toast.success('Интеграция создана');
      setIsFormOpen(false);
      handleResetForm();
      queryClient.invalidateQueries({ queryKey: ['bitrix-integrations'] });
    },
    onError: () => toast.error('Ошибка при создании'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      (api as any).updateBitrixIntegration(id, data),
    onSuccess: () => {
      toast.success('Интеграция обновлена');
      setIsFormOpen(false);
      setEditId(null);
      handleResetForm();
      queryClient.invalidateQueries({ queryKey: ['bitrix-integrations'] });
    },
    onError: () => toast.error('Ошибка при обновлении'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => (api as any).deleteBitrixIntegration(id),
    onSuccess: () => {
      toast.success('Интеграция удалена');
      queryClient.invalidateQueries({ queryKey: ['bitrix-integrations'] });
    },
    onError: () => toast.error('Ошибка при удалении'),
  });

  const handleResetForm = () => {
    setFormData({
      name: '',
      portal_url: '',
      webhook_url: '',
      outgoing_webhook_token: '',
      target_category_id: '0',
      target_stage_id: '',
      contract_field_mapping: '',
      object_field_mapping: '',
      is_active: true,
    });
  };

  const handleEdit = (item: BitrixIntegration) => {
    setEditId(item.id);
    setFormData({
      name: item.name,
      portal_url: item.portal_url,
      webhook_url: item.webhook_url || '',
      outgoing_webhook_token: item.outgoing_webhook_token || '',
      target_category_id: String(item.target_category_id),
      target_stage_id: item.target_stage_id,
      contract_field_mapping: item.contract_field_mapping,
      object_field_mapping: item.object_field_mapping,
      is_active: item.is_active,
    });
    setIsFormOpen(true);
  };

  const handleSubmit = () => {
    const payload = {
      name: formData.name,
      portal_url: formData.portal_url,
      webhook_url: formData.webhook_url || undefined,
      outgoing_webhook_token: formData.outgoing_webhook_token || undefined,
      target_category_id: parseInt(formData.target_category_id),
      target_stage_id: formData.target_stage_id,
      contract_field_mapping: formData.contract_field_mapping,
      object_field_mapping: formData.object_field_mapping,
      is_active: formData.is_active,
    };

    if (editId) {
      updateMutation.mutate({ id: editId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleConfirmDelete = (id: number, name: string) => {
    if (window.confirm(`Удалить интеграцию "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleCopyWebhookUrl = () => {
    const webhookUrl = `${window.location.origin}/api/supply/webhook/bitrix/`;
    navigator.clipboard.writeText(webhookUrl);
    toast.success('URL вебхука скопирован');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Интеграция с Битрикс24</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Настройка подключений к порталам Битрикс24 для автоматического получения запросов на снабжение
          </p>
        </div>
        <Button onClick={() => { handleResetForm(); setEditId(null); setIsFormOpen(true); }} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Новая интеграция
        </Button>
      </div>

      {/* Webhook URL */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">URL для входящего вебхука в Битрикс24</p>
              <p className="text-xs text-muted-foreground mt-1">
                Укажите этот URL в настройках исходящего вебхука Битрикс24 (событие <code className="bg-blue-100 px-1 rounded">onCrmDealUpdate</code>)
              </p>
              <div className="flex items-center gap-2 mt-2">
                <code className="bg-white border px-3 py-1.5 rounded text-sm font-mono flex-1">
                  {window.location.origin}/api/supply/webhook/bitrix/
                </code>
                <Button variant="outline" size="sm" onClick={handleCopyWebhookUrl}>
                  <Copy className="w-4 h-4 mr-1" />
                  Копировать
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrations List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : !integrations || integrations.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <Link2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">Нет интеграций</p>
          <p className="text-sm mt-1">Создайте подключение к порталу Битрикс24</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {integrations.map((item) => (
            <Card key={item.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${item.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{item.name}</p>
                        <Badge variant={item.is_active ? 'default' : 'secondary'} className="text-xs">
                          {item.is_active ? 'Активна' : 'Неактивна'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span>Портал: {item.portal_url}</span>
                        <span>Стадия: {item.target_stage_id}</span>
                        <span>Создана: {formatDate(item.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(item)}
                      aria-label="Редактировать"
                      tabIndex={0}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-600"
                      onClick={() => handleConfirmDelete(item.id, item.name)}
                      aria-label="Удалить"
                      tabIndex={0}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => {
        if (!open) { setIsFormOpen(false); setEditId(null); handleResetForm(); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Редактировать' : 'Новая'} интеграция</DialogTitle>
            <DialogDescription>
              Настройте подключение к порталу Битрикс24
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <div>
              <Label>Название *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="Наш Битрикс24"
                className="mt-1"
              />
            </div>
            <div>
              <Label>URL портала *</Label>
              <Input
                value={formData.portal_url}
                onChange={(e) => setFormData((p) => ({ ...p, portal_url: e.target.value }))}
                placeholder="https://company.bitrix24.ru"
                className="mt-1"
              />
            </div>
            <div>
              <Label>URL исходящего вебхука (для запросов к Битрикс24 API)</Label>
              <Input
                value={formData.webhook_url}
                onChange={(e) => setFormData((p) => ({ ...p, webhook_url: e.target.value }))}
                placeholder="https://company.bitrix24.ru/rest/1/xxxxxxxx/"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Входящий вебхук в Битрикс24 для доступа к API (crm, disk)
              </p>
            </div>
            <div>
              <Label>Токен проверки исходящего вебхука</Label>
              <Input
                value={formData.outgoing_webhook_token}
                onChange={(e) => setFormData((p) => ({ ...p, outgoing_webhook_token: e.target.value }))}
                placeholder="Токен из настроек исходящего вебхука"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>ID воронки (категории)</Label>
                <Input
                  type="number"
                  value={formData.target_category_id}
                  onChange={(e) => setFormData((p) => ({ ...p, target_category_id: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>ID целевой стадии *</Label>
                <Input
                  value={formData.target_stage_id}
                  onChange={(e) => setFormData((p) => ({ ...p, target_stage_id: e.target.value }))}
                  placeholder="C1:UC_XXXXXX"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Стадия «Передан в оплату»
                </p>
              </div>
            </div>
            <div>
              <Label>Поле маппинга «Договор»</Label>
              <Input
                value={formData.contract_field_mapping}
                onChange={(e) => setFormData((p) => ({ ...p, contract_field_mapping: e.target.value }))}
                placeholder="UF_CRM_CONTRACT или TITLE"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Поле маппинга «Объект»</Label>
              <Input
                value={formData.object_field_mapping}
                onChange={(e) => setFormData((p) => ({ ...p, object_field_mapping: e.target.value }))}
                placeholder="UF_CRM_OBJECT или TITLE"
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData((p) => ({ ...p, is_active: v }))}
                id="integration-active"
              />
              <Label htmlFor="integration-active">Активна</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => { setIsFormOpen(false); setEditId(null); handleResetForm(); }}>
              Отмена
            </Button>
            <Button
              disabled={!formData.name || !formData.portal_url || !formData.target_stage_id || createMutation.isPending || updateMutation.isPending}
              onClick={handleSubmit}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editId ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
