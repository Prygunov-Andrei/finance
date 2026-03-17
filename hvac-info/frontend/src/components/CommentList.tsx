import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { MessageSquare, AlertCircle, Loader2 } from 'lucide-react';
import commentService, { Comment } from '../services/commentService';
import CommentItem from './CommentItem';
import { Button } from './ui/button';
import { useTranslation } from 'react-i18next';

interface CommentListProps {
  newsId: number;
  comments: Comment[];
  setComments: (comments: Comment[]) => void;
  onCommentsLoad?: (count: number) => void;
}

export type CommentListRef = {
  scrollToBottom: () => void;
};

const CommentList = forwardRef<CommentListRef, CommentListProps>(
  ({ newsId, comments, setComments, onCommentsLoad }, ref) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      loadComments();
    }, [newsId, t]);

    const loadComments = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await commentService.getCommentsByNews(newsId);
        setComments(data);
        if (onCommentsLoad) {
          onCommentsLoad(data.length);
        }
      } catch (err: any) {
        setError(err.message || t('comments.loadError'));
      } finally {
        setLoading(false);
      }
    };

    // Обновление комментария
    const handleEdit = async (commentId: number, newText: string) => {
      try {
        const updatedComment = await commentService.updateComment(commentId, { text: newText });
        setComments(comments.map(c => c.id === commentId ? updatedComment : c));
      } catch (err: any) {
        throw err;
      }
    };

    // Удаление комментария
    const handleDelete = async (commentId: number) => {
      try {
        await commentService.deleteComment(commentId);
        setComments(comments.filter(c => c.id !== commentId));
        if (onCommentsLoad) {
          onCommentsLoad(comments.length - 1);
        }
      } catch (err: any) {
        throw err;
      }
    };

    // Метод для прокрутки к нижней части комментариев
    useImperativeHandle(ref, () => ({
      scrollToBottom: () => {
        if (containerRef.current) {
          containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      },
    }));

    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-destructive mb-2">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={loadComments}
              >
                {t('common.retry')}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4" ref={containerRef}>
        {/* Заголовок секции */}
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <MessageSquare className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-medium">
            {t('comments.title')} ({comments.length})
          </h3>
        </div>

        {/* Список комментариев */}
        {comments.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            {t('comments.noComments')}
          </p>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

CommentList.displayName = 'CommentList';

export default CommentList;