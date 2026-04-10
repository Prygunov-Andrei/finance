'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ExternalLink, UserPlus, Eye, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

import { api } from '@/lib/api';
import { CONSTANTS, STATUS_LABELS, AVITO_LISTING_STATUS_COLORS } from '@/constants';
import type { AvitoListingItem } from '@/lib/api/types/marketing';

export function AvitoIncomingTab() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Add form state
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newSellerName, setNewSellerName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const { data: listings = [], isLoading } = useQuery({
    queryKey: ['avito-listings', filterStatus],
    queryFn: () => api.marketing.getAvitoListings({
      status: filterStatus || undefined,
    }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.marketing.updateListingStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avito-listings'] });
    },
  });

  const convertMutation = useMutation({
    mutationFn: (id: number) => api.marketing.convertListingToExecutor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avito-listings'] });
      queryClient.invalidateQueries({ queryKey: ['executor-profiles'] });
      toast.success('Исполнитель создан из объявления');
    },
    onError: (err: Error) => toast.error(`Ошибка: ${err.message}`),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const itemId = newUrl.match(/\/(\d+)(?:\?|$)/)?.[1] || `manual_${Date.now()}`;
      return api.marketing.createAvitoListing({
        avito_item_id: itemId,
        url: newUrl || `https://avito.ru/manual/${Date.now()}`,
        title: newTitle,
        city: newCity,
        seller_name: newSellerName,
        description: newDescription,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avito-listings'] });
      toast.success('Объявление добавлено');
      setAddDialogOpen(false);
      setNewUrl(''); setNewTitle(''); setNewCity(''); setNewSellerName(''); setNewDescription('');
    },
    onError: (err: Error) => toast.error(`Ошибка: ${err.message}`),
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-3 items-center">
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">Все статусы</option>
          <option value="new">Новые</option>
          <option value="reviewed">Просмотренные</option>
          <option value="contacted">Контакт установлен</option>
          <option value="converted">Конвертированы</option>
          <option value="rejected">Отклонённые</option>
        </select>
        <div className="flex-1" />
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Добавить объявление
        </Button>
      </div>

      {/* Listings */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
      ) : listings.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Нет объявлений. Добавьте первое объявление вручную.
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((listing: AvitoListingItem) => (
            <div key={listing.id} className="border rounded-lg p-4 hover:bg-muted/30">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={AVITO_LISTING_STATUS_COLORS[listing.status] || ''}>
                      {STATUS_LABELS[listing.status] || listing.status}
                    </Badge>
                    {listing.keyword_text && (
                      <Badge variant="outline" className="text-xs">{listing.keyword_text}</Badge>
                    )}
                  </div>
                  <h3 className="font-medium text-sm truncate">{listing.title}</h3>
                  <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                    {listing.city && <span>{listing.city}</span>}
                    {listing.seller_name && <span>{listing.seller_name}</span>}
                    {listing.price && <span>{listing.price} \u20BD</span>}
                    <span>{new Date(listing.discovered_at).toLocaleDateString('ru-RU')}</span>
                  </div>
                  {listing.executor_name && (
                    <div className="text-xs text-green-600 mt-1">\u2192 {listing.executor_name}</div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {listing.url && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={listing.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  )}
                  {listing.status === 'new' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => updateStatusMutation.mutate({ id: listing.id, status: 'reviewed' })}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                  {listing.status !== 'converted' && listing.status !== 'rejected' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => convertMutation.mutate(listing.id)}
                      disabled={convertMutation.isPending}
                    >
                      <UserPlus className="w-4 h-4" />
                    </Button>
                  )}
                  {listing.status !== 'rejected' && listing.status !== 'converted' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500"
                      onClick={() => updateStatusMutation.mutate({ id: listing.id, status: 'rejected' })}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Добавить объявление</DialogTitle>
            <DialogDescription>Ручное добавление объявления с Avito</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={e => { e.preventDefault(); createMutation.mutate(); }}
            className="space-y-3"
          >
            <div>
              <Label>Ссылка на Avito</Label>
              <Input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://www.avito.ru/..." />
            </div>
            <div>
              <Label>Заголовок *</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Монтаж вентиляции — ищу работу" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Город</Label>
                <Input value={newCity} onChange={e => setNewCity(e.target.value)} placeholder="Москва" />
              </div>
              <div>
                <Label>Имя продавца</Label>
                <Input value={newSellerName} onChange={e => setNewSellerName(e.target.value)} placeholder="Иванов Иван" />
              </div>
            </div>
            <div>
              <Label>Описание</Label>
              <Textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} rows={3} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>Отмена</Button>
              <Button type="submit" disabled={createMutation.isPending || !newTitle.trim()}>
                {createMutation.isPending ? 'Добавление...' : 'Добавить'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
