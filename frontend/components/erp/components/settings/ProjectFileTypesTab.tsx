import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ProjectFileType } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, MoreVertical, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { CONSTANTS } from '@/constants';

type FormData = {
  name: string;
  code: string;
  sort_order: string;
  is_active: boolean;
};

const EMPTY_FORM: FormData = { name: '', code: '', sort_order: '0', is_active: true };

export function ProjectFileTypesTab() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectFileType | null>(null);
  const [deleting, setDeleting] = useState<ProjectFileType | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const queryClient = useQueryClient();

  const { data: fileTypes, isLoading, error } = useQuery({
    queryKey: ['project-file-types'],
    queryFn: () => api.estimates.getProjectFileTypes(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; code: string; sort_order: number; is_active: boolean }) =>
      api.estimates.createProjectFileType(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-file-types'] });
      setIsDialogOpen(false);
      setForm(EMPTY_FORM);
      toast.success('Тип файла создан');
    },
    onError: (err: Error) => toast.error(err.message || 'Ошибка создания'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ name: string; code: string; sort_order: number; is_active: boolean }> }) =>
      api.estimates.updateProjectFileType(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-file-types'] });
      setEditing(null);
      setForm(EMPTY_FORM);
      toast.success('Тип файла обновлён');
    },
    onError: (err: Error) => toast.error(err.message || 'Ошибка обновления'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.estimates.deleteProjectFileType(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-file-types'] });
      setDeleting(null);
      toast.success('Тип файла удалён');
    },
    onError: (err: Error) => {
      toast.error(err.message?.includes('PROTECT') || err.message?.includes('связанные')
        ? 'Нельзя удалить тип, к которому привязаны файлы'
        : err.message || 'Ошибка удаления');
      setDeleting(null);
    },
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setIsDialogOpen(true);
  };

  const openEdit = (ft: ProjectFileType) => {
    setForm({ name: ft.name, code: ft.code, sort_order: ft.sort_order.toString(), is_active: ft.is_active });
    setEditing(ft);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      sort_order: parseInt(form.sort_order) || 0,
      is_active: form.is_active,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const isFormValid = form.name.trim().length > 0 && form.code.trim().length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl">
        Ошибка загрузки: {(error as Error).message}
      </div>
    );
  }

  const items = fileTypes ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Типы файлов проектов</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Справочник типов документов для проектной документации
          </p>
        </div>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Добавить тип
        </Button>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        {items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Нет типов файлов. Добавьте первый тип.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Название</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Код</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Порядок</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Статус</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((ft) => (
                <tr key={ft.id} className="hover:bg-muted/50">
                  <td className="px-6 py-4 font-medium text-foreground">{ft.name}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground font-mono">{ft.code}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{ft.sort_order}</td>
                  <td className="px-6 py-4">
                    {ft.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        <Check className="w-3 h-3" /> Активен
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground">
                        <X className="w-3 h-3" /> Неактивен
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(ft)}>
                          <Pencil className="w-4 h-4 mr-2" /> Редактировать
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleting(ft)}
                          className="text-red-600 dark:text-red-400"
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Удалить
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) { setIsDialogOpen(false); setEditing(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Редактировать тип файла' : 'Новый тип файла'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Измените параметры типа файла' : 'Добавьте новый тип документа для проектов'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pft-name">Название *</Label>
              <Input
                id="pft-name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Спецификация"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pft-code">Код *</Label>
              <Input
                id="pft-code"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                placeholder="specification"
              />
              <p className="text-xs text-muted-foreground">Уникальный код (латиница, snake_case)</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pft-sort">Порядок сортировки</Label>
              <Input
                id="pft-sort"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="pft-active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                className="rounded border-border"
              />
              <Label htmlFor="pft-active">Активен</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); setEditing(null); setForm(EMPTY_FORM); }}>
                Отмена
              </Button>
              <Button type="submit" disabled={!isFormValid || isSubmitting} className="bg-blue-600 hover:bg-blue-700">
                {isSubmitting ? 'Сохранение...' : editing ? 'Сохранить' : 'Создать'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить тип файла?</AlertDialogTitle>
            <AlertDialogDescription>
              Тип «{deleting?.name}» будет удалён. Если к нему привязаны файлы, удаление будет невозможно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
