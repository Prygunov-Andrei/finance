'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Star, Phone, Mail, MapPin, Globe, MessageCircle, Pencil, Trash2,
  Clock, User, Send,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

import { api } from '@/lib/api';
import {
  EXECUTOR_SPECIALIZATIONS,
  EXECUTOR_SOURCE_LABELS,
  CONTACT_CHANNEL_LABELS,
  CONSTANTS,
} from '@/constants';
import type { ExecutorProfileDetail, ContactHistoryItem } from '@/lib/api/types/marketing';

interface Props {
  profileId: number;
  onEdit: (profile: ExecutorProfileDetail) => void;
  onDelete: (id: number) => void;
}

export function ExecutorDetailPanel({ profileId, onEdit, onDelete }: Props) {
  const queryClient = useQueryClient();

  const [showContactForm, setShowContactForm] = useState(false);
  const [contactChannel, setContactChannel] = useState('phone');
  const [contactDirection, setContactDirection] = useState('out');
  const [contactSubject, setContactSubject] = useState('');
  const [contactBody, setContactBody] = useState('');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['executor-profile', profileId],
    queryFn: () => api.marketing.getExecutorProfile(profileId),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['executor-contacts', profileId],
    queryFn: () => api.marketing.getContactHistory(profileId),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const addContactMutation = useMutation({
    mutationFn: () => api.marketing.addContact(profileId, {
      channel: contactChannel,
      direction: contactDirection,
      subject: contactSubject,
      body: contactBody,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executor-contacts', profileId] });
      toast.success('Контакт записан');
      setShowContactForm(false);
      setContactSubject('');
      setContactBody('');
    },
    onError: (err: Error) => toast.error(`Ошибка: ${err.message}`),
  });

  const specLabel = (value: string) =>
    EXECUTOR_SPECIALIZATIONS.find(s => s.value === value)?.label || value;

  if (isLoading || !profile) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Загрузка...</DialogTitle>
        </DialogHeader>
        <div className="py-12 text-center text-muted-foreground">Загрузка профиля...</div>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-start justify-between">
          <div>
            <DialogTitle className="text-xl">{profile.counterparty.name}</DialogTitle>
            <DialogDescription className="mt-1">
              {EXECUTOR_SOURCE_LABELS[profile.source] || profile.source}
              {profile.counterparty.legal_form && ` \u2022 ${profile.counterparty.legal_form.toUpperCase()}`}
              {profile.counterparty.inn && ` \u2022 ИНН ${profile.counterparty.inn}`}
            </DialogDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => onEdit(profile)}>
              <Pencil className="w-4 h-4 mr-1" /> Редактировать
            </Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={() => onDelete(profile.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-6 mt-4">
        {/* Status badges */}
        <div className="flex gap-2 flex-wrap">
          {profile.is_potential ? (
            <Badge variant="outline">Потенциальный</Badge>
          ) : (
            <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">Действующий</Badge>
          )}
          {profile.is_available ? (
            <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400">Доступен</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Недоступен</Badge>
          )}
          {profile.is_verified && <Badge className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400">Проверен</Badge>}
          <div className="flex items-center gap-1 ml-auto">
            <Star className="w-4 h-4 text-yellow-500" />
            <span className="font-medium">{profile.rating}</span>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Contacts */}
          <div className="space-y-2">
            <h3 className="font-medium text-sm text-muted-foreground uppercase">Контакты</h3>
            {profile.phone && <div className="flex items-center gap-2 text-sm"><Phone className="w-4 h-4 text-muted-foreground" />{profile.phone}</div>}
            {profile.email && <div className="flex items-center gap-2 text-sm"><Mail className="w-4 h-4 text-muted-foreground" />{profile.email}</div>}
            {profile.telegram_username && <div className="flex items-center gap-2 text-sm"><MessageCircle className="w-4 h-4 text-muted-foreground" />@{profile.telegram_username}</div>}
            {profile.whatsapp && <div className="flex items-center gap-2 text-sm"><Phone className="w-4 h-4 text-muted-foreground" />WA: {profile.whatsapp}</div>}
            {profile.contact_person && <div className="flex items-center gap-2 text-sm"><User className="w-4 h-4 text-muted-foreground" />{profile.contact_person}</div>}
            {profile.avito_profile_url && (
              <div className="flex items-center gap-2 text-sm">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <a href={profile.avito_profile_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Профиль на Avito
                </a>
              </div>
            )}
          </div>

          {/* Location & Work */}
          <div className="space-y-2">
            <h3 className="font-medium text-sm text-muted-foreground uppercase">Работа</h3>
            {profile.city && <div className="flex items-center gap-2 text-sm"><MapPin className="w-4 h-4 text-muted-foreground" />{profile.city}{profile.region && `, ${profile.region}`}</div>}
            {profile.work_radius_km && <div className="text-sm text-muted-foreground">Радиус работ: {profile.work_radius_km} км</div>}
            {profile.team_size && <div className="text-sm">Бригада: {profile.team_size} чел.</div>}
            {profile.experience_years && <div className="text-sm">Стаж: {profile.experience_years} лет</div>}
            {profile.hourly_rate && <div className="text-sm">Ставка/час: {profile.hourly_rate} руб</div>}
            {profile.daily_rate && <div className="text-sm">Ставка/день: {profile.daily_rate} руб</div>}
          </div>
        </div>

        {/* Specializations */}
        {profile.specializations.length > 0 && (
          <div>
            <h3 className="font-medium text-sm text-muted-foreground uppercase mb-2">Специализации</h3>
            <div className="flex flex-wrap gap-2">
              {profile.specializations.map(s => (
                <Badge key={s} variant="secondary">{specLabel(s)}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {profile.notes && (
          <div>
            <h3 className="font-medium text-sm text-muted-foreground uppercase mb-2">Заметки</h3>
            <p className="text-sm whitespace-pre-wrap">{profile.notes}</p>
          </div>
        )}

        {/* Contact History */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm text-muted-foreground uppercase">
              История контактов ({contacts.length})
            </h3>
            <Button size="sm" variant="outline" onClick={() => setShowContactForm(!showContactForm)}>
              <Send className="w-3 h-3 mr-1" /> Записать контакт
            </Button>
          </div>

          {showContactForm && (
            <div className="bg-muted/50 rounded-lg p-3 mb-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Канал</Label>
                  <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={contactChannel} onChange={e => setContactChannel(e.target.value)}>
                    {Object.entries(CONTACT_CHANNEL_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Направление</Label>
                  <select className="w-full h-9 rounded-md border bg-background px-2 text-sm" value={contactDirection} onChange={e => setContactDirection(e.target.value)}>
                    <option value="out">Исходящее</option>
                    <option value="in">Входящее</option>
                  </select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Тема</Label>
                <Input value={contactSubject} onChange={e => setContactSubject(e.target.value)} placeholder="Предложение работы" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Комментарий</Label>
                <Textarea value={contactBody} onChange={e => setContactBody(e.target.value)} rows={2} placeholder="Детали контакта..." />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowContactForm(false)}>Отмена</Button>
                <Button size="sm" onClick={() => addContactMutation.mutate()} disabled={addContactMutation.isPending}>
                  Сохранить
                </Button>
              </div>
            </div>
          )}

          {contacts.length === 0 ? (
            <div className="text-center py-4 text-sm text-muted-foreground">Нет записей</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {contacts.map((contact: ContactHistoryItem) => (
                <div key={contact.id} className="flex items-start gap-3 p-2 rounded hover:bg-muted/30 text-sm">
                  <div className="shrink-0 mt-0.5">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {CONTACT_CHANNEL_LABELS[contact.channel] || contact.channel}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {contact.direction === 'in' ? '\u2190' : '\u2192'}
                      </span>
                      {contact.subject && <span className="font-medium truncate">{contact.subject}</span>}
                    </div>
                    {contact.body && <p className="text-muted-foreground mt-0.5 line-clamp-2">{contact.body}</p>}
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(contact.created_at).toLocaleString('ru-RU')}
                      {contact.created_by_name && ` \u2022 ${contact.created_by_name}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
