import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import newsService, { News } from '../services/newsService';
import { toast } from 'sonner';
import { Edit, Trash2, Send, Clock, FileText } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import MainLayout from '../components/MainLayout';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { stripHtml, extractFirstImageFromHtml } from '../utils/htmlHelpers';

export default function ScheduledPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  
  const [scheduled, setScheduled] = useState<News[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [publishingId, setPublishingId] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.is_staff) {
      toast.error('У вас нет прав для доступа к этой странице');
      navigate('/');
      return;
    }
    loadScheduled();
  }, [user, navigate]);

  const loadScheduled = async () => {
    setIsLoading(true);
    try {
      const data = await newsService.getScheduled();
      setScheduled(data);
    } catch (error) {
      console.error('Failed to load scheduled news:', error);
      toast.error('Не удалось загрузить запланированные новости');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await newsService.deleteNews(id);
      toast.success('Новость удалена');
      setScheduled(scheduled.filter(s => s.id !== id));
    } catch (error) {
      console.error('Failed to delete news:', error);
      toast.error('Не удалось удалить новость');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePublishNow = async (id: number) => {
    setPublishingId(id);
    try {
      await newsService.publishNews(id);
      toast.success('Новость опубликована');
      setScheduled(scheduled.filter(s => s.id !== id));
    } catch (error) {
      console.error('Failed to publish news:', error);
      toast.error('Не удалось опубликовать новость');
    } finally {
      setPublishingId(null);
    }
  };

  const getTimeUntilPublish = (pubDate: string) => {
    const now = new Date();
    const publish = new Date(pubDate);
    const diff = publish.getTime() - now.getTime();
    
    if (diff < 0) return 'Скоро будет опубликовано';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `Через ${days} ${days === 1 ? 'день' : 'дней'}`;
    if (hours > 0) return `Через ${hours} ${hours === 1 ? 'час' : 'часов'}`;
    return `Через ${minutes} ${minutes === 1 ? 'минуту' : 'минут'}`;
  };

  if (isLoading) {
    return (
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout>
      <div className="container max-w-6xl mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1>Запланированные новости</h1>
            <p className="text-muted-foreground mt-1">
              {scheduled.length} {scheduled.length === 1 ? 'новость' : 'новостей'}
            </p>
          </div>
          <Button asChild>
            <Link to="/news/create">
              <FileText className="w-4 h-4 mr-2" />
              Создать новость
            </Link>
          </Button>
        </div>

        {scheduled.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="mb-2">Нет запланированных новостей</h3>
              <p className="text-muted-foreground mb-6">
                Запланируйте публикацию новости на будущее
              </p>
              <Button asChild>
                <Link to="/news/create">Создать новость</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {scheduled.map((news) => {
              const imageUrl = extractFirstImageFromHtml(news.body);
              
              return (
                <Card key={news.id} className="hover:shadow-lg transition-shadow overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    {imageUrl && (
                      <div className="w-full md:w-80 flex-shrink-0 h-52 md:h-56 bg-white grid place-items-center p-4">
                        <ImageWithFallback
                          src={imageUrl}
                          alt={news.title}
                          style={{ 
                            maxWidth: '100%', 
                            maxHeight: '100%',
                            objectFit: 'contain'
                          }}
                        />
                      </div>
                    )}
                    <div className="flex-1 flex flex-col">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <CardTitle className="text-xl">{news.title}</CardTitle>
                              <Badge variant="secondary">
                                <Clock className="w-3 h-3 mr-1" />
                                Запланировано
                              </Badge>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">
                                Публикация: {new Date(news.pub_date).toLocaleDateString('ru-RU', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                              <p className="text-sm font-medium text-primary">
                                {getTimeUntilPublish(news.pub_date)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-muted-foreground line-clamp-3">
                          {stripHtml(news.body)}
                        </p>
                      </CardContent>
                      <CardFooter className="flex gap-2 mt-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <Link to={`/news/edit/${news.id}`}>
                            <Edit className="w-4 h-4 mr-2" />
                            Редактировать
                          </Link>
                        </Button>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={publishingId === news.id}
                            >
                              <Send className="w-4 h-4 mr-2" />
                              Опубликовать сейчас
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Опубликовать сейчас?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Новость будет опубликована немедленно, минуя запланированное время публикации.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Отмена</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handlePublishNow(news.id)}>
                                Опубликовать
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={deletingId === news.id}
                              className="ml-auto"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Удалить
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Удалить новость?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Это действие нельзя отменить. Новость будет удалена навсегда.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Отмена</AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleDelete(news.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Удалить
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </CardFooter>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}