'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, ArrowRight, ArrowLeft } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

import { api } from '@/lib/api';
import { CONSTANTS, CONTACT_CHANNEL_LABELS } from '@/constants';
import type { MarketingDashboard } from '@/lib/api/types/marketing';

export function ContactHistoryTab() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['marketing-dashboard'],
    queryFn: () => api.marketing.getDashboard(),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const contacts = dashboard?.recent_contacts || [];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Последние контакты</h2>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Нет записей контактов. Записи появляются при отправке рассылок или ручном добавлении.
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map(contact => (
            <div key={contact.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/30">
              <div className="shrink-0 mt-0.5">
                <Clock className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {CONTACT_CHANNEL_LABELS[contact.channel] || contact.channel}
                  </Badge>
                  {contact.direction === 'in' ? (
                    <ArrowLeft className="w-3 h-3 text-blue-500" />
                  ) : (
                    <ArrowRight className="w-3 h-3 text-green-500" />
                  )}
                  <span className="text-sm font-medium">{contact.executor_name}</span>
                  {contact.subject && (
                    <span className="text-sm text-muted-foreground truncate">\u2014 {contact.subject}</span>
                  )}
                </div>
                {contact.body && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{contact.body}</p>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(contact.created_at).toLocaleString('ru-RU')}
                  {contact.created_by_name && ` \u2022 ${contact.created_by_name}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dashboard Stats */}
      {dashboard && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-card border rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Исполнителей в базе</div>
            <div className="text-2xl font-semibold">{dashboard.executors.total}</div>
            <div className="text-xs text-muted-foreground">{dashboard.executors.potential} потенциальных</div>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Новых на Avito</div>
            <div className="text-2xl font-semibold">{dashboard.avito.incoming_new}</div>
            <div className="text-xs text-muted-foreground">{dashboard.avito.published_active} наших объявлений</div>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <div className="text-sm text-muted-foreground">Рассылок в этом месяце</div>
            <div className="text-2xl font-semibold">{dashboard.campaigns.sent_this_month}</div>
            <div className="text-xs text-muted-foreground">{dashboard.campaigns.total_recipients_sent} получателей</div>
          </div>
        </div>
      )}
    </div>
  );
}
