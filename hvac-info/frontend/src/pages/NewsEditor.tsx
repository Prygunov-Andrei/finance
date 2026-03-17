import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import RichTextEditor from '../components/RichTextEditor';
import newsService, { NewsCreateData, NewsUpdateData } from '../services/newsService';
import { toast } from 'sonner';
import { ArrowLeft, Save, Send } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Alert, AlertDescription } from '../components/ui/alert';
import { ExternalLink, Sparkles } from 'lucide-react';
import { getServerBaseUrl, getMediaUrl } from '../config/api';
import { processImageUrls } from '../utils/htmlHelpers';

export default function NewsEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState<'ru' | 'en' | 'de' | 'pt'>('ru');
  const [status, setStatus] = useState<'draft' | 'scheduled' | 'published'>('draft');
  const [pubDate, setPubDate] = useState('');
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined);

  // Проверка прав администратора
  useEffect(() => {
    if (!user?.is_staff) {
      toast.error('У вас нет прав для доступа к этой странице');
      navigate('/');
    }
  }, [user, navigate]);

  // Загрузка существующей новости для редактирования
  useEffect(() => {
    if (id) {
      loadNews(parseInt(id));
    } else {
      // Для новой новости устанавливаем текущую дату и время
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setPubDate(now.toISOString().slice(0, 16));
    }
  }, [id]);

  const loadNews = async (newsId: number) => {
    setIsLoading(true);
    try {
      const news = await newsService.getNewsById(newsId);
      setTitle(news.title);
      
      // Обрабатываем URL изображений в body перед загрузкой в редактор
      const processedBody = processImageUrls(news.body);
      setBody(processedBody);
      
      setSourceLanguage(news.source_language || 'ru');
      setStatus(news.status || 'draft');
      
      // Преобразуем дату в формат datetime-local
      const date = new Date(news.pub_date);
      date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
      setPubDate(date.toISOString().slice(0, 16));
      setSourceUrl(news.source_url);
    } catch (error: any) {
      console.error('Failed to load news:', error);
      toast.error('Не удалось загрузить новость');
      navigate('/news');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = async (file: File): Promise<string> => {
    try {
      const media = await newsService.uploadMedia(file);
      toast.success('Изображение загружено');
      return media.url;
    } catch (error: any) {
      console.error('Failed to upload image:', error);
      
      if (error.response?.data?.file) {
        throw new Error(error.response.data.file[0]);
      }
      throw new Error('Не удалось загрузить изображение');
    }
  };

  const validateForm = (): boolean => {
    if (!title.trim()) {
      toast.error('Заголовок не может быть пустым');
      return false;
    }
    if (!body.trim() || body === '<p></p>') {
      toast.error('Текст новости не может быть пустым');
      return false;
    }
    if (!pubDate) {
      toast.error('Укажите дату публикации');
      return false;
    }
    return true;
  };

  const handleSaveDraft = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const data: NewsCreateData | NewsUpdateData = {
        title,
        body,
        pub_date: new Date(pubDate).toISOString(),
        status: 'draft',
        source_language: sourceLanguage,
        auto_translate: autoTranslate,
        source_url: sourceUrl,
      };

      if (id) {
        await newsService.updateNews(parseInt(id), data);
        toast.success('Черновик сохранен');
      } else {
        const news = await newsService.createNews(data as NewsCreateData);
        toast.success('Черновик создан');
        navigate(`/news/edit/${news.id}`);
      }
    } catch (error: any) {
      console.error('Failed to save draft:', error);
      
      if (error.response?.data) {
        const errors = error.response.data;
        Object.keys(errors).forEach(key => {
          toast.error(`${key}: ${errors[key][0]}`);
        });
      } else {
        toast.error('Не удалось сохранить черновик');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      // Определяем финальный статус в зависимости от даты публикации
      let finalStatus = status;
      const selectedDate = new Date(pubDate);
      const now = new Date();
      
      // Если дата в будущем - запланировано, иначе - опубликовано
      if (status === 'draft') {
        finalStatus = selectedDate > now ? 'scheduled' : 'published';
      }

      const data: NewsCreateData | NewsUpdateData = {
        title,
        body,
        pub_date: new Date(pubDate).toISOString(),
        status: finalStatus,
        source_language: sourceLanguage,
        auto_translate: autoTranslate,
        source_url: sourceUrl,
      };

      if (id) {
        await newsService.updateNews(parseInt(id), data);
        if (finalStatus === 'published') {
          toast.success('Новость опубликована');
        } else if (finalStatus === 'scheduled') {
          toast.success('Новость запланирована');
        } else {
          toast.success('Новость обновлена');
        }
      } else {
        await newsService.createNews(data as NewsCreateData);
        if (finalStatus === 'published') {
          toast.success('Новость опубликована');
        } else if (finalStatus === 'scheduled') {
          toast.success('Новость запланирована');
        } else {
          toast.success('Новость создана');
        }
      }
      
      navigate('/news');
    } catch (error: any) {
      console.error('Failed to publish news:', error);
      
      if (error.response?.data) {
        const errors = error.response.data;
        Object.keys(errors).forEach(key => {
          toast.error(`${key}: ${errors[key][0]}`);
        });
      } else {
        toast.error('Не удалось опубликовать новость');
      }
    } finally {
      setIsSaving(false);
      setShowPublishDialog(false);
    }
  };

  // Автоматическая установка статуса в зависимости от даты
  useEffect(() => {
    if (pubDate) {
      const selectedDate = new Date(pubDate);
      const now = new Date();
      
      if (selectedDate > now && status === 'published') {
        setStatus('scheduled');
      }
    }
  }, [pubDate, status]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/news')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад к новостям
        </Button>
        
        <h1>{id ? 'Редактировать новость' : 'Создать новость'}</h1>
      </div>

      <div className="grid gap-6">
        {/* Основная информация */}
        <Card>
          <CardHeader>
            <CardTitle>Основная информация</CardTitle>
            <CardDescription>
              Заполните заголовок и текст новости
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Заголовок *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Введите заголовок новости"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Текст новости *</Label>
              <div className="mt-1">
                <RichTextEditor
                  content={body}
                  onChange={setBody}
                  onImageUpload={handleImageUpload}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Информация об источнике - только при редактировании автоматически созданной новости */}
        {id && sourceUrl && (
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <div>
                <strong>Автоматически созданная новость</strong>
                <p className="text-sm mt-1">
                  Эта новость была создана автоматически через систему поиска новостей
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="w-3 h-3" />
                  Открыть источник
                </a>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Настройки публикации */}
        <Card>
          <CardHeader>
            <CardTitle>Настройки публикации</CardTitle>
            <CardDescription>
              Выберите язык, статус и дату публикации
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Поле для URL источника */}
            <div>
              <Label htmlFor="source-url">URL источника (опционально)</Label>
              <Input
                id="source-url"
                type="url"
                value={sourceUrl || ''}
                onChange={(e) => setSourceUrl(e.target.value || undefined)}
                placeholder="https://example.com/article"
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Укажите ссылку на оригинальную статью, если новость взята из внешнего источника
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="source-language">Исходный язык</Label>
                <Select
                  value={sourceLanguage}
                  onValueChange={(value: any) => setSourceLanguage(value)}
                >
                  <SelectTrigger id="source-language" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ru">Русский</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="pt">Português</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="status">Статус</Label>
                <Select
                  value={status}
                  onValueChange={(value: any) => setStatus(value)}
                >
                  <SelectTrigger id="status" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Черновик</SelectItem>
                    <SelectItem value="scheduled">Запланировано</SelectItem>
                    <SelectItem value="published">Опубликовано</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="pub-date">Дата и время публикации *</Label>
              <Input
                id="pub-date"
                type="datetime-local"
                value={pubDate}
                onChange={(e) => setPubDate(e.target.value)}
                className="mt-1"
              />
              {status === 'scheduled' && (
                <p className="text-sm text-muted-foreground mt-1">
                  Новость будет автоматически опубликована в указанное время
                </p>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="auto-translate"
                checked={autoTranslate}
                onCheckedChange={(checked) => setAutoTranslate(checked as boolean)}
              />
              <Label
                htmlFor="auto-translate"
                className="text-sm font-normal cursor-pointer"
              >
                Автоматически перевести на все языки
              </Label>
            </div>
            {autoTranslate && (
              <p className="text-sm text-muted-foreground">
                После сохранения новость будет автоматически переведена на английский, немецкий и португальский языки
              </p>
            )}
          </CardContent>
        </Card>

        {/* Кнопки действий */}
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isSaving}
          >
            <Save className="w-4 h-4 mr-2" />
            Сохранить черновик
          </Button>
          <Button
            onClick={() => setShowPublishDialog(true)}
            disabled={isSaving}
          >
            <Send className="w-4 h-4 mr-2" />
            {status === 'draft' ? 'Опубликовать' : 
             status === 'scheduled' ? 'Запланировать' : 
             'Сохранить и опубликовать'}
          </Button>
        </div>
      </div>

      {/* Диалог подтверждения публикации */}
      <AlertDialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердите действие</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const selectedDate = new Date(pubDate);
                const now = new Date();
                const isFutureDate = selectedDate > now;
                
                if (status === 'published') {
                  return 'Вы уверены, что хотите опубликовать эту новость? Она сразу станет доступна всем пользователям.';
                } else if (status === 'scheduled' || (status === 'draft' && isFutureDate)) {
                  return `Новость будет автоматически опубликована ${selectedDate.toLocaleString('ru-RU')}`;
                } else {
                  return 'Вы уверены, что хотите опубликовать эту новость? Она сразу станет доступна всем пользователям.';
                }
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handlePublish}>
              Подтвердить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}