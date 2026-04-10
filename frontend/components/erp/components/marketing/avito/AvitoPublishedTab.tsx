'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, RefreshCw, Eye, Users, Heart } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { api } from '@/lib/api';
import { CONSTANTS, STATUS_LABELS } from '@/constants';
import type { AvitoPublishedListingItem } from '@/lib/api/types/marketing';

const PUBLISHED_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400',
  published: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
  expired: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300',
  deactivated: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300',
  error: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400',
};

export function AvitoPublishedTab() {
  const queryClient = useQueryClient();

  const { data: published = [], isLoading } = useQuery({
    queryKey: ['avito-published'],
    queryFn: () => api.marketing.getPublishedListings(),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const refreshMutation = useMutation({
    mutationFn: (id: number) => api.marketing.refreshPublishedStats(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['avito-published'] }),
  });

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Загрузка...</div>;
  }

  if (published.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Нет опубликованных объявлений. Объявления создаются автоматически при публикации МП.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {published.map((item: AvitoPublishedListingItem) => (
        <div key={item.id} className="border rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Badge className={PUBLISHED_STATUS_COLORS[item.status] || ''}>
                  {STATUS_LABELS[item.status] || item.status}
                </Badge>
                <span className="text-sm font-medium">{item.mp_number}</span>
              </div>
              <h3 className="text-sm">{item.listing_title || item.mp_name}</h3>
              {item.object_name && (
                <div className="text-xs text-muted-foreground mt-1">Объект: {item.object_name}</div>
              )}
              {item.error_message && (
                <div className="text-xs text-red-500 mt-1">{item.error_message}</div>
              )}

              {/* Stats */}
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{item.views_count}</span>
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{item.contacts_count}</span>
                <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{item.favorites_count}</span>
                {item.published_at && (
                  <span>Опубликовано: {new Date(item.published_at).toLocaleDateString('ru-RU')}</span>
                )}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              {item.avito_url && (
                <Button size="sm" variant="ghost" asChild>
                  <a href={item.avito_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => refreshMutation.mutate(item.id)}
                disabled={refreshMutation.isPending}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
