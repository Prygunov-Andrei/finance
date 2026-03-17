import React, { useState } from 'react';
import { Comment } from '../services/commentService';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Edit2, Trash2, Check, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

interface CommentItemProps {
  comment: Comment;
  onEdit: (commentId: number, newText: string) => Promise<void>;
  onDelete: (commentId: number) => Promise<void>;
}

export default function CommentItem({ comment, onEdit, onDelete }: CommentItemProps) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Проверка, является ли текущий пользователь автором комментария
  const isAuthor = user?.id === comment.author.id;

  // Форматирование даты
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const localeMap: Record<string, string> = {
      ru: 'ru-RU',
      en: 'en-US',
      de: 'de-DE',
      pt: 'pt-PT',
    };

    const locale = localeMap[i18n.language] || 'en-US';

    return date.toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Обработка сохранения изменений
  const handleSave = async () => {
    if (!editText.trim()) return;

    try {
      setIsSaving(true);
      await onEdit(comment.id, editText);
      setIsEditing(false);
      toast.success(t('comments.updated') || 'Комментарий обновлен');
    } catch (error) {
      toast.error(t('comments.updateError') || 'Ошибка обновления комментария');
    } finally {
      setIsSaving(false);
    }
  };

  // Обработка отмены редактирования
  const handleCancel = () => {
    setEditText(comment.text);
    setIsEditing(false);
  };

  // Обработка удаления
  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete(comment.id);
      toast.success(t('comments.deleteSuccess') || 'Комментарий удален');
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error(t('comments.deleteError') || 'Ошибка удаления комментария');
      setIsDeleting(false);
    }
  };

  return (
    <div className="border-b border-border pb-4 last:border-b-0">
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="font-medium text-foreground">
            {comment.author.first_name || comment.author.email}
          </span>
          <span className="text-sm text-muted-foreground ml-2">
            {formatDate(comment.created_at)}
          </span>
          {comment.updated_at !== comment.created_at && (
            <span className="text-xs text-muted-foreground ml-2">
              ({t('comments.edited')})
            </span>
          )}
        </div>

        {/* Кнопки редактирования и удаления (только для автора) */}
        {isAuthor && !isEditing && (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="h-8 px-2"
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeleting}
              className="h-8 px-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Текст комментария или форма редактирования */}
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            maxLength={2000}
            className="resize-none"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !editText.trim()}
            >
              <Check className="w-4 h-4 mr-1" />
              {t('comments.save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
            >
              <X className="w-4 h-4 mr-1" />
              {t('comments.cancel')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {editText.length}/2000 {t('comments.characters')}
          </p>
        </div>
      ) : (
        <p className="text-foreground whitespace-pre-wrap">{comment.text}</p>
      )}

      {/* Диалог подтверждения удаления */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('comments.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('comments.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('comments.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t('comments.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}