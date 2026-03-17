import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import newsService, { News } from '../services/newsService';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Calendar, AlertCircle, RefreshCw, ExternalLink, Trash2, AlertTriangle } from 'lucide-react';
import MainLayout from '../components/MainLayout';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { getLocalizedDate } from '../utils/i18nHelpers';
import { Checkbox } from '../components/ui/checkbox';

export default function NewsNotFound() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const isAdmin = user?.is_staff === true;

  // Проверка прав администратора
  useEffect(() => {
    if (!isAdmin) {
      toast.error('У вас нет прав для доступа к этой странице');
      navigate('/');
    }
  }, [isAdmin, navigate]);

  useEffect(() => {
    if (isAdmin) {
      loadRecords();
    }
  }, [isAdmin]);

  const loadRecords = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await newsService.getNoNewsFound();
      setRecords(data);
    } catch (err: any) {
      console.error('Failed to load no-news-found records:', err);
      setError('Не удалось загрузить записи');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map(r => r.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) {
      toast.error('Выберите записи для удаления');
      return;
    }

    setIsDeleting(true);
    try {
      await newsService.bulkDeleteNews(Array.from(selectedIds));
      toast.success(`Удалено записей: ${selectedIds.size}`);
      setSelectedIds(new Set());
      await loadRecords();
    } catch (error) {
      console.error('Failed to delete records:', error);
      toast.error('Не удалось удалить записи');
    } finally {
      setIsDeleting(false);
      setShowBulkDeleteDialog(false);
    }
  };

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      const result = await newsService.bulkDeleteNoNewsFound();
      if (result.deleted > 0) {
        toast.success(`Удалено записей: ${result.deleted}`);
      }
      if (result.errors > 0) {
        toast.error(`Не удалось удалить: ${result.errors}`);
      }
      await loadRecords();
    } catch (error) {
      console.error('Failed to delete all records:', error);
      toast.error('Не удалось удалить записи');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateString: string): string => {
    return getLocalizedDate(dateString, 'ru');
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="max-w-5xl mx-auto">
            <h1 className="mb-6">Записи "новостей не найдено"</h1>
            <div className="text-muted-foreground">Загрузка...</div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="max-w-5xl mx-auto">
            <h1 className="mb-6">Записи "новостей не найдено"</h1>
            <Card className="p-6 border-destructive bg-destructive/10">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-destructive font-medium mb-2">{error}</p>
                  <Button 
                    onClick={loadRecords}
                    variant="outline"
                    size="sm"
                    disabled={loading}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Попробовать еще раз
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <h1>Записи "новостей не найдено"</h1>
                <Badge variant="secondary">{records.length}</Badge>
              </div>
              <Button
                onClick={loadRecords}
                variant="outline"
                size="sm"
                disabled={loading}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Обновить
              </Button>
            </div>
            <p className="text-muted-foreground text-sm">
              Эти записи создаются автоматически, когда система поиска новостей не находит новых материалов в источнике.
            </p>
          </div>

          {records.length > 0 && (
            <Card className="p-4 mb-4 bg-muted/30">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedIds.size === records.length}
                    onCheckedChange={handleToggleSelectAll}
                    id="select-all"
                  />
                  <label htmlFor="select-all" className="cursor-pointer text-sm">
                    Выбрать все
                  </label>
                  {selectedIds.size > 0 && (
                    <Badge variant="outline">{selectedIds.size} выбрано</Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  {selectedIds.size > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowBulkDeleteDialog(true)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Удалить выбранные ({selectedIds.size})
                    </Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isDeleting || records.length === 0}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Удалить все
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Удалить все записи "не найдено"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Будут удалены все {records.length} записей "новостей не найдено". 
                          Это действие нельзя отменить.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Отмена</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={handleDeleteAll}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Удалить все
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {records.map((record) => (
              <Card key={record.id} className="p-4 bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900">
                <div className="flex items-start gap-4">
                  <Checkbox
                    checked={selectedIds.has(record.id)}
                    onCheckedChange={() => handleToggleSelect(record.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
                        <h3 className="text-base truncate">{record.title}</h3>
                      </div>
                      <Badge variant="secondary">Черновик</Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(record.created_at || record.pub_date)}</span>
                      </div>
                      {record.source_url && (
                        <a
                          href={record.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Проверить источник
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {/* Показываем краткое описание, если есть */}
                    {record.body && record.body !== '<p></p>' && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {record.body.replace(/<[^>]*>/g, '').substring(0, 150)}...
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {records.length === 0 && !loading && !error && (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground mb-2">
                Нет записей "новостей не найдено"
              </p>
              <p className="text-sm text-muted-foreground">
                Когда система автоматического поиска не найдет новостей, они появятся здесь
              </p>
            </div>
          )}

          {/* Диалог подтверждения массового удаления выбранных */}
          <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить выбранные записи?</AlertDialogTitle>
                <AlertDialogDescription>
                  Будут удалены {selectedIds.size} записей "новостей не найдено". 
                  Это действие нельзя отменить.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleBulkDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Удалить выбранные
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </MainLayout>
  );
}