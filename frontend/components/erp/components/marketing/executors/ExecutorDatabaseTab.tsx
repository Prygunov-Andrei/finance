'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Filter, Search, X, Star, Phone, Mail, MapPin } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { api } from '@/lib/api';
import { CONSTANTS, EXECUTOR_SPECIALIZATIONS, EXECUTOR_SOURCE_LABELS, STATUS_LABELS } from '@/constants';
import type { ExecutorProfileListItem, ExecutorProfileDetail } from '@/lib/api/types/marketing';
import { ExecutorProfileDialog } from './ExecutorProfileDialog';
import { ExecutorDetailPanel } from './ExecutorDetailPanel';

export function ExecutorDatabaseTab() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterCity, setFilterCity] = useState('');
  const [filterPotential, setFilterPotential] = useState<string>('');
  const [filterAvailable, setFilterAvailable] = useState<string>('');

  // Debounce search
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimer) clearTimeout(searchTimer);
    setSearchTimer(setTimeout(() => setDebouncedSearch(value), CONSTANTS.DEBOUNCE_DELAY_MS));
  };

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<ExecutorProfileDetail | null>(null);
  const [detailProfile, setDetailProfile] = useState<ExecutorProfileListItem | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Queries
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['executor-profiles', debouncedSearch, filterCity, filterPotential, filterAvailable],
    queryFn: () => api.marketing.getExecutorProfiles({
      search: debouncedSearch || undefined,
      city: filterCity || undefined,
      is_potential: filterPotential || undefined,
      is_available: filterAvailable || undefined,
    }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.marketing.deleteExecutorProfile(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executor-profiles'] });
      toast.success('Исполнитель удалён');
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(`Ошибка: ${err.message}`),
  });

  const handleResetFilters = () => {
    setFilterCity('');
    setFilterPotential('');
    setFilterAvailable('');
    setSearch('');
    setDebouncedSearch('');
  };

  const hasActiveFilters = filterCity || filterPotential || filterAvailable;

  const specLabel = (value: string) =>
    EXECUTOR_SPECIALIZATIONS.find(s => s.value === value)?.label || value;

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Всего</div>
          <div className="text-2xl font-semibold">{profiles.length}</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Потенциальные</div>
          <div className="text-2xl font-semibold">{profiles.filter(p => p.is_potential).length}</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Доступные</div>
          <div className="text-2xl font-semibold">{profiles.filter(p => p.is_available).length}</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Из Avito</div>
          <div className="text-2xl font-semibold">{profiles.filter(p => p.source === 'avito').length}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени, телефону, email, городу..."
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
          <Filter className="w-4 h-4 mr-2" />
          Фильтры
          {hasActiveFilters && <span className="ml-1 w-2 h-2 rounded-full bg-blue-500" />}
        </Button>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Добавить
        </Button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Город</label>
              <Input
                placeholder="Москва"
                value={filterCity}
                onChange={e => setFilterCity(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Статус</label>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={filterPotential}
                onChange={e => setFilterPotential(e.target.value)}
              >
                <option value="">Все</option>
                <option value="true">Потенциальные</option>
                <option value="false">Действующие</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Доступность</label>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={filterAvailable}
                onChange={e => setFilterAvailable(e.target.value)}
              >
                <option value="">Все</option>
                <option value="true">Доступные</option>
                <option value="false">Недоступные</option>
              </select>
            </div>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleResetFilters}>
              <X className="w-4 h-4 mr-1" /> Сбросить фильтры
            </Button>
          )}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {debouncedSearch || hasActiveFilters
            ? 'Ничего не найдено. Попробуйте изменить фильтры.'
            : 'База монтажников пуста. Добавьте первого исполнителя.'}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Имя</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Город</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Специализации</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Контакты</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Рейтинг</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Статус</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Источник</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {profiles.map(profile => (
                <tr
                  key={profile.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => setDetailProfile(profile)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm">{profile.counterparty_name}</div>
                    {profile.counterparty_short_name && profile.counterparty_short_name !== profile.counterparty_name && (
                      <div className="text-xs text-muted-foreground">{profile.counterparty_short_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {profile.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        {profile.city}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {profile.specializations.slice(0, 3).map(s => (
                        <Badge key={s} variant="secondary" className="text-xs">
                          {specLabel(s)}
                        </Badge>
                      ))}
                      {profile.specializations.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{profile.specializations.length - 3}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm space-y-0.5">
                    {profile.phone && (
                      <div className="flex items-center gap-1 text-xs">
                        <Phone className="w-3 h-3 text-muted-foreground" />
                        {profile.phone}
                      </div>
                    )}
                    {profile.email && (
                      <div className="flex items-center gap-1 text-xs">
                        <Mail className="w-3 h-3 text-muted-foreground" />
                        {profile.email}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-yellow-500" />
                      {profile.rating}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {profile.is_potential ? (
                      <Badge variant="outline" className="text-xs">Потенциальный</Badge>
                    ) : (
                      <Badge className="text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                        Действующий
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {EXECUTOR_SOURCE_LABELS[profile.source] || profile.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новый исполнитель</DialogTitle>
            <DialogDescription>Добавить монтажника в базу</DialogDescription>
          </DialogHeader>
          <ExecutorProfileDialog
            onSuccess={() => {
              setCreateDialogOpen(false);
              queryClient.invalidateQueries({ queryKey: ['executor-profiles'] });
            }}
            onCancel={() => setCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editProfile} onOpenChange={() => setEditProfile(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Редактирование</DialogTitle>
            <DialogDescription>{editProfile?.counterparty?.name}</DialogDescription>
          </DialogHeader>
          {editProfile && (
            <ExecutorProfileDialog
              profile={editProfile}
              onSuccess={() => {
                setEditProfile(null);
                queryClient.invalidateQueries({ queryKey: ['executor-profiles'] });
              }}
              onCancel={() => setEditProfile(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Detail Panel */}
      <Dialog open={!!detailProfile} onOpenChange={() => setDetailProfile(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          {detailProfile && (
            <ExecutorDetailPanel
              profileId={detailProfile.id}
              onEdit={(profile) => {
                setDetailProfile(null);
                setEditProfile(profile);
              }}
              onDelete={(id) => {
                setDetailProfile(null);
                setDeleteId(id);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить исполнителя?</AlertDialogTitle>
            <AlertDialogDescription>
              Профиль исполнителя и вся история контактов будут удалены. Контрагент останется в системе.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
