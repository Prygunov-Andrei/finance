'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

import { api } from '@/lib/api';
import { CONSTANTS } from '@/constants';
import { AvitoKeywordManager } from '../avito/AvitoKeywordManager';

export function ExecutorSettingsTab() {
  const queryClient = useQueryClient();

  // Avito config
  const { data: avitoConfig } = useQuery({
    queryKey: ['avito-config'],
    queryFn: () => api.marketing.getAvitoConfig(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const [avitoClientId, setAvitoClientId] = useState('');
  const [avitoClientSecret, setAvitoClientSecret] = useState('');
  const [avitoUserId, setAvitoUserId] = useState('');
  const [autoPublishMp, setAutoPublishMp] = useState(false);
  const [avitoActive, setAvitoActive] = useState(false);
  const [listingTemplate, setListingTemplate] = useState('');

  useEffect(() => {
    if (avitoConfig) {
      setAvitoClientId(avitoConfig.client_id);
      setAvitoClientSecret(avitoConfig.client_secret);
      setAvitoUserId(avitoConfig.user_id);
      setAutoPublishMp(avitoConfig.auto_publish_mp);
      setAvitoActive(avitoConfig.is_active);
      setListingTemplate(avitoConfig.listing_template);
    }
  }, [avitoConfig]);

  const avitoMutation = useMutation({
    mutationFn: () => api.marketing.updateAvitoConfig({
      client_id: avitoClientId,
      client_secret: avitoClientSecret,
      user_id: avitoUserId,
      auto_publish_mp: autoPublishMp,
      is_active: avitoActive,
      listing_template: listingTemplate,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avito-config'] });
      toast.success('Настройки Avito сохранены');
    },
    onError: (err: Error) => toast.error(`Ошибка: ${err.message}`),
  });

  // Unisender config
  const { data: unisenderConfig } = useQuery({
    queryKey: ['unisender-config'],
    queryFn: () => api.marketing.getUnisenderConfig(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const [uniApiKey, setUniApiKey] = useState('');
  const [uniSenderEmail, setUniSenderEmail] = useState('');
  const [uniSenderName, setUniSenderName] = useState('');
  const [uniSmsSender, setUniSmsSender] = useState('');
  const [uniActive, setUniActive] = useState(false);

  useEffect(() => {
    if (unisenderConfig) {
      setUniApiKey(unisenderConfig.api_key);
      setUniSenderEmail(unisenderConfig.sender_email);
      setUniSenderName(unisenderConfig.sender_name);
      setUniSmsSender(unisenderConfig.sms_sender);
      setUniActive(unisenderConfig.is_active);
    }
  }, [unisenderConfig]);

  const unisenderMutation = useMutation({
    mutationFn: () => api.marketing.updateUnisenderConfig({
      api_key: uniApiKey,
      sender_email: uniSenderEmail,
      sender_name: uniSenderName,
      sms_sender: uniSmsSender,
      is_active: uniActive,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unisender-config'] });
      toast.success('Настройки Unisender сохранены');
    },
    onError: (err: Error) => toast.error(`Ошибка: ${err.message}`),
  });

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Avito Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Avito API</h2>
          {avitoConfig && (
            <div className="flex items-center gap-2 text-sm">
              {avitoConfig.is_token_valid ? (
                <><CheckCircle className="w-4 h-4 text-green-500" /> Токен активен</>
              ) : (
                <><XCircle className="w-4 h-4 text-red-500" /> Токен не получен</>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Client ID</Label>
            <Input value={avitoClientId} onChange={e => setAvitoClientId(e.target.value)} placeholder="Avito Client ID" />
          </div>
          <div>
            <Label>Client Secret</Label>
            <Input type="password" value={avitoClientSecret} onChange={e => setAvitoClientSecret(e.target.value)} placeholder="Avito Client Secret" />
          </div>
          <div>
            <Label>User ID</Label>
            <Input value={avitoUserId} onChange={e => setAvitoUserId(e.target.value)} placeholder="ID пользователя Avito" />
          </div>
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={avitoActive} onCheckedChange={v => setAvitoActive(v === true)} />
            Интеграция активна
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={autoPublishMp} onCheckedChange={v => setAutoPublishMp(v === true)} />
            Авто-публикация МП при статусе &laquo;Опубликовано&raquo;
          </label>
        </div>

        <div>
          <Label>Шаблон объявления</Label>
          <Textarea
            value={listingTemplate}
            onChange={e => setListingTemplate(e.target.value)}
            rows={4}
            placeholder="Ищем монтажников для объекта «{object_name}» ({city}). Виды работ: {work_types}. Объём: {man_hours} чел/час, сумма: {total_amount} руб."
          />
          <p className="text-xs text-muted-foreground mt-1">
            Переменные: {'{object_name}'}, {'{city}'}, {'{work_types}'}, {'{man_hours}'}, {'{total_amount}'}
          </p>
        </div>

        <Button onClick={() => avitoMutation.mutate()} disabled={avitoMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          {avitoMutation.isPending ? 'Сохранение...' : 'Сохранить настройки Avito'}
        </Button>
      </section>

      {/* Keywords */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Ключевые слова для мониторинга</h2>
        <AvitoKeywordManager />
      </section>

      {/* Unisender Section */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Unisender (Email + SMS)</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>API-ключ</Label>
            <Input type="password" value={uniApiKey} onChange={e => setUniApiKey(e.target.value)} placeholder="Unisender API Key" />
          </div>
          <div>
            <Label>Email отправителя</Label>
            <Input type="email" value={uniSenderEmail} onChange={e => setUniSenderEmail(e.target.value)} placeholder="noreply@company.ru" />
          </div>
          <div>
            <Label>Имя отправителя</Label>
            <Input value={uniSenderName} onChange={e => setUniSenderName(e.target.value)} placeholder="Август Климат" />
          </div>
          <div>
            <Label>SMS отправитель</Label>
            <Input value={uniSmsSender} onChange={e => setUniSmsSender(e.target.value)} placeholder="AvgustClim" maxLength={11} />
            <p className="text-xs text-muted-foreground mt-1">До 11 символов латиницей</p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={uniActive} onCheckedChange={v => setUniActive(v === true)} />
          Unisender активен
        </label>

        <Button onClick={() => unisenderMutation.mutate()} disabled={unisenderMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          {unisenderMutation.isPending ? 'Сохранение...' : 'Сохранить настройки Unisender'}
        </Button>
      </section>
    </div>
  );
}
