import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import commentService, { Comment } from '../services/commentService';
import { toast } from 'sonner';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { AlertCircle, Send } from 'lucide-react';

interface CommentFormProps {
  newsId: number;
  onCommentAdded: (comment: Comment) => void;
}

export default function CommentForm({ newsId, onCommentAdded }: CommentFormProps) {
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!comment.trim()) {
      setError(t('comments.emptyError'));
      return;
    }

    if (!isAuthenticated) {
      setError(t('comments.notAuthenticatedError'));
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const newComment = await commentService.createComment({ news_post: newsId, text: comment });
      onCommentAdded(newComment);
      setComment('');
      toast.success(t('comments.posted') || 'Комментарий добавлен');
    } catch (err: any) {
      toast.error(err.message || t('comments.postError') || 'Не удалось добавить комментарий');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Если пользователь не авторизован, показываем сообщение
  if (!isAuthenticated) {
    return (
      <div className="bg-muted border border-border rounded-lg p-4">
        <p className="text-muted-foreground text-center">
          {t('comments.loginRequired')}{' '}
          <Link to="/login" className="text-primary hover:underline">
            {t('auth.login')}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t('comments.placeholder')}
          rows={4}
          maxLength={2000}
          className="resize-none"
          disabled={isSubmitting}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {comment.length}/2000 {t('comments.characters')}
        </p>
      </div>

      {/* Сообщение об ошибке */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting || !comment.trim()}
        className="w-full sm:w-auto"
      >
        <Send className="w-4 h-4 mr-2" />
        {isSubmitting ? t('comments.submitting') : t('comments.submit')}
      </Button>
    </form>
  );
}