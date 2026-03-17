import logging
import requests as http_requests
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from django.conf import settings
from django.db.models import Sum, Avg, Count
from decimal import Decimal
from .models import NewsPost, Comment, MediaUpload, SearchConfiguration, NewsDiscoveryRun, DiscoveryAPICall
from .serializers import (
    NewsPostSerializer, NewsPostWriteSerializer, CommentSerializer, MediaUploadSerializer,
    SearchConfigurationSerializer, SearchConfigurationListSerializer,
    NewsDiscoveryRunSerializer, NewsDiscoveryRunListSerializer,
    DiscoveryAPICallSerializer, DiscoveryStatsSerializer
)
from .translation_service import TranslationService

logger = logging.getLogger(__name__)


def get_default_prompts() -> dict:
    """Возвращает все дефолтные промпты из кода discovery_service.py"""
    return {
        'system_prompts': {
            'grok': 'Today is {current_date}. You have web search access.\n\nIMPORTANT: Dates in January 2026 are NOT in the future - they are current or recent past. You MUST perform web search for these dates.',
            'openai': 'You are a news discovery assistant. Today is {current_date}. Use web search to find recent news articles. Return results in Russian language only, in JSON format.',
            'anthropic': 'News search. JSON: {"news": [{"title": "...", "summary": "..."}]}',
            'gemini': '',
        },
        'search_prompts': {
            'ru': {
                'main': 'Найди все свежие новости на сайте {url} ({name}) за последние 2 недели.\n\nИспользуй веб-поиск. Ищи все статьи, публикации, пресс-релизы, новости на сайте. Для каждой найденной новости верни заголовок, текст новости (1 абзац) и ссылку на источник.',
                'json_format': 'Верни ответ СТРОГО в JSON формате:\n\n{{\n  "news": [\n    {{\n      "title": "Заголовок новости",\n      "summary": "Текст новости (1 абзац). Пиши напрямую, как журналист, от третьего лица.",\n      "source_url": "https://example.com/news/article"\n    }}\n  ]\n}}\n\nЕсли новостей не найдено: {{"news": []}}\n\nВерни ТОЛЬКО JSON, без комментариев.'
            },
            'en': {
                'main': 'Find all recent news on website {url} ({name}) from the last 2 weeks.\n\nUse web search. Look for all articles, publications, press releases, news on the website. For each news item, provide title, summary (1 paragraph) and source link.\n\n**IMPORTANT: Translate all news to Russian. Return only Russian text.**',
                'json_format': 'Return STRICTLY in JSON format:\n\n{{\n  "news": [\n    {{\n      "title": "Заголовок новости на русском",\n      "summary": "Текст новости на русском (1 абзац). Пиши напрямую, как журналист, от третьего лица.",\n      "source_url": "https://example.com/news/article"\n    }}\n  ]\n}}\n\nIf no news found: {{"news": []}}\n\nReturn ONLY JSON in Russian, no comments.'
            },
            'es': {
                'main': 'Encuentra noticias en {url} ({name}), {start_date} a {end_date}.\n\nUsa búsqueda web. Para cada: título, resumen (1 párrafo). **Traduce al ruso solamente.**',
                'json_format': 'JSON:\n{{"news": [{{"title": "русский", "summary": "русский текст"}}]}}\n\nVacío: {{"news": []}}'
            },
            'de': {
                'main': 'Finde Nachrichten auf {url} ({name}), {start_date} bis {end_date}.\n\nVerwende Websuche. Für jede: Titel, Zusammenfassung (1 Absatz). **Übersetze nur auf Russisch.**',
                'json_format': 'JSON:\n{{"news": [{{"title": "русский", "summary": "русский текст"}}]}}\n\nLeer: {{"news": []}}'
            },
            'pt': {
                'main': 'Encontre notícias em {url} ({name}), {start_date} a {end_date}.\n\nUse pesquisa web. Para cada: título, resumo (1 parágrafo). **Traduza apenas para russo.**',
                'json_format': 'JSON:\n{{"news": [{{"title": "русский", "summary": "русский текст"}}]}}\n\nVazio: {{"news": []}}'
            }
        },
        'manufacturer_prompts': {
            'with_websites': 'Find news: {manufacturer_name}, {start_date} to {end_date}.\n\nOfficial sites: {websites}\n\nUse web search. **Translate to Russian only.**\n\n{json_format}',
            'without_websites': 'Find news: {manufacturer_name}, {start_date} to {end_date}.\n\nUse web search. Sources: industry publications, press releases. **Translate to Russian only.**\n\n{json_format}'
        }
    }


class NewsPostViewSet(viewsets.ModelViewSet):
    """
    ViewSet для новостей.
    - Чтение: все пользователи (только опубликованные новости)
    - Создание/Редактирование/Удаление: только администраторы
    """
    permission_classes = [permissions.AllowAny]
    
    def get_serializer_class(self):
        """Используем разные сериализаторы для чтения и записи"""
        if self.action in ['create', 'update', 'partial_update']:
            return NewsPostWriteSerializer
        return NewsPostSerializer
    
    def get_queryset(self):
        """
        Админы видят все новости (включая будущие, черновики и запланированные).
        Обычные пользователи видят только опубликованные новости (status=published и pub_date <= now).
        Поддерживает фильтрацию по is_no_news_found через query parameter.
        """
        queryset = NewsPost.objects.select_related('author').prefetch_related('media').all()
        
        # Если пользователь не админ, показываем только опубликованные новости
        if not self.request.user.is_staff:
            queryset = queryset.filter(
                status='published',
                pub_date__lte=timezone.now()
            )
        
        # Фильтрация по is_no_news_found (для массового удаления на фронтенде)
        is_no_news_found = self.request.query_params.get('is_no_news_found', None)
        if is_no_news_found is not None:
            # Преобразуем строку в boolean
            is_no_news_found_bool = is_no_news_found.lower() in ('true', '1', 'yes')
            queryset = queryset.filter(is_no_news_found=is_no_news_found_bool)
        
        return queryset
    
    def get_permissions(self):
        """
        Переопределяем права доступа для разных действий.
        """
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'drafts', 'scheduled', 'publish']:
            return [permissions.IsAdminUser()]
        return [permissions.AllowAny()]
    
    def _handle_translation_and_response(self, news_post, auto_translate, source_language, request):
        """Общая логика для обработки автоперевода и возврата полного объекта"""
        # Выполняем автоперевод если запрошен
        if auto_translate and settings.TRANSLATION_ENABLED:
            self._translate_news_post(news_post, source_language)
            # Обновляем объект из БД после перевода
            news_post.refresh_from_db()
        
        # Возвращаем полный объект через NewsPostSerializer
        output_serializer = NewsPostSerializer(news_post, context={'request': request})
        return output_serializer.data
    
    def create(self, request, *args, **kwargs):
        """Переопределяем create для обработки автоперевода и возврата полного объекта"""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Извлекаем auto_translate до сохранения, чтобы не передавать его в модель
        auto_translate = serializer.validated_data.pop('auto_translate', False)
        source_language = serializer.validated_data.get('source_language', settings.MODELTRANSLATION_DEFAULT_LANGUAGE)
        
        news_post = serializer.save(author=request.user)
        
        output_data = self._handle_translation_and_response(news_post, auto_translate, source_language, request)
        headers = self.get_success_headers(output_data)
        return Response(output_data, status=status.HTTP_201_CREATED, headers=headers)
    
    def update(self, request, *args, **kwargs):
        """Переопределяем update для обработки автоперевода и возврата полного объекта"""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        
        # Извлекаем auto_translate до сохранения, чтобы не передавать его в модель
        auto_translate = serializer.validated_data.pop('auto_translate', False)
        source_language = serializer.validated_data.get('source_language', instance.source_language)
        
        news_post = serializer.save()
        
        output_data = self._handle_translation_and_response(news_post, auto_translate, source_language, request)
        return Response(output_data)
    
    def _translate_news_post(self, news_post, source_language):
        """Выполняет перевод новости на все языки"""
        try:
            translation_service = TranslationService()
            
            # Получаем исходный текст из поля для исходного языка
            # modeltranslation использует title_ru, title_en и т.д.
            title = getattr(news_post, f'title_{source_language}', None) or news_post.title
            body = getattr(news_post, f'body_{source_language}', None) or news_post.body
            
            if not title or not body:
                logger.warning(f"Empty title or body for news post {news_post.id}, skipping translation")
                return
            
            # Переводим на все языки
            translations = translation_service.translate_news(title, body, source_language)
            
            # Сохраняем переводы в соответствующие поля
            for lang, trans in translations.items():
                if lang != source_language and trans.get('title') and trans.get('body'):
                    setattr(news_post, f'title_{lang}', trans['title'])
                    setattr(news_post, f'body_{lang}', trans['body'])
            
            # Сохраняем исходный текст в поле для исходного языка, если его там еще нет
            if not getattr(news_post, f'title_{source_language}', None):
                setattr(news_post, f'title_{source_language}', title)
            if not getattr(news_post, f'body_{source_language}', None):
                setattr(news_post, f'body_{source_language}', body)
            
            news_post.save()
            logger.info(f"Translation completed for news post {news_post.id}")
        except Exception as e:
            # Логируем ошибку, но не блокируем создание/обновление новости
            logger.error(f"Translation failed for news post {news_post.id}: {str(e)}", exc_info=True)
    
    @action(detail=False, methods=['get'])
    def drafts(self, request):
        """Получить все черновики (только для админов)"""
        drafts = self.get_queryset().filter(status='draft')
        serializer = self.get_serializer(drafts, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def scheduled(self, request):
        """Получить все запланированные новости (только для админов)"""
        scheduled = self.get_queryset().filter(status='scheduled')
        serializer = self.get_serializer(scheduled, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        """Опубликовать новость сейчас (только для админов)"""
        news_post = self.get_object()
        news_post.status = 'published'
        if news_post.pub_date > timezone.now():
            news_post.pub_date = timezone.now()
        news_post.save()
        serializer = self.get_serializer(news_post)
        return Response(serializer.data)


class CommentViewSet(viewsets.ModelViewSet):
    """
    ViewSet для комментариев.
    - Создание: только авторизованные пользователи
    - Чтение: все пользователи
    - Обновление/Удаление: только автор комментария или администратор
    """
    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        queryset = Comment.objects.select_related('author', 'news_post').all()
        # Фильтрация по новости, если передан параметр
        news_post_id = self.request.query_params.get('news_post', None)
        if news_post_id:
            queryset = queryset.filter(news_post_id=news_post_id)
        return queryset

    def get_permissions(self):
        """
        Переопределяем права доступа для разных действий.
        """
        if self.action in ['create']:
            return [permissions.IsAuthenticated()]
        elif self.action in ['update', 'partial_update', 'destroy']:
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def perform_create(self, serializer):
        """Автор устанавливается автоматически из request.user"""
        serializer.save(author=self.request.user)

    def get_serializer_context(self):
        """Передаем request в контекст сериализатора"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def _check_comment_permission(self, instance, request, action_name):
        """Проверяет права пользователя на редактирование/удаление комментария"""
        if instance.author != request.user and not request.user.is_staff:
            return Response(
                {'detail': f'You do not have permission to {action_name} this comment.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return None

    def update(self, request, *args, **kwargs):
        """Проверяем, что пользователь может редактировать только свои комментарии"""
        instance = self.get_object()
        permission_error = self._check_comment_permission(instance, request, 'edit')
        if permission_error:
            return permission_error
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Проверяем, что пользователь может удалять только свои комментарии или является админом"""
        instance = self.get_object()
        permission_error = self._check_comment_permission(instance, request, 'delete')
        if permission_error:
            return permission_error
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='by-news/(?P<news_id>[^/.]+)')
    def by_news(self, request, news_id=None):
        """Получить все комментарии для конкретной новости"""
        comments = self.get_queryset().filter(news_post_id=news_id)
        serializer = self.get_serializer(comments, many=True)
        return Response(serializer.data)


class MediaUploadViewSet(viewsets.ModelViewSet):
    """
    ViewSet для загрузки медиафайлов.
    Только администраторы могут загружать, просматривать и удалять файлы.
    """
    serializer_class = MediaUploadSerializer
    permission_classes = [permissions.IsAdminUser]
    
    def get_queryset(self):
        """Админы видят все загруженные файлы"""
        return MediaUpload.objects.select_related('uploaded_by').all()
    
    def get_serializer_context(self):
        """Передаем request в контекст сериализатора для генерации URL"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class SearchConfigurationViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления конфигурациями поиска.
    Только администраторы могут просматривать и редактировать конфигурации.
    """
    permission_classes = [permissions.IsAdminUser]
    
    def get_queryset(self):
        return SearchConfiguration.objects.all()
    
    def get_serializer_class(self):
        if self.action == 'list':
            return SearchConfigurationListSerializer
        return SearchConfigurationSerializer
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Получить активную конфигурацию"""
        config = SearchConfiguration.get_active()
        serializer = SearchConfigurationSerializer(config)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Активировать конфигурацию"""
        config = self.get_object()
        config.is_active = True
        config.save()
        return Response({'status': 'activated', 'id': config.id, 'name': config.name})
    
    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Дублировать конфигурацию для тестирования"""
        original = self.get_object()
        # Создаем копию
        original.pk = None
        original.id = None
        original.name = f"{original.name} (copy)"
        original.is_active = False
        original.save()
        serializer = SearchConfigurationSerializer(original)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=False, methods=['get'], url_path='default-prompts')
    def default_prompts(self, request):
        """Возвращает все дефолтные промпты из кода (для предзаполнения формы)"""
        return Response(get_default_prompts())
    
    @action(detail=False, methods=['post'], url_path='check-providers')
    def check_providers(self, request):
        """
        Проверяет доступность и баланс провайдеров.
        Принимает JSON с ключами провайдеров для проверки.
        Возвращает: {provider: {available: bool, balance: number|null, error: string|null}}
        """
        providers_to_check = request.data.get('providers', ['grok', 'anthropic', 'openai', 'gemini'])
        results = {}
        
        for provider in providers_to_check:
            results[provider] = self._check_single_provider(provider)
        
        return Response(results)
    
    def _check_single_provider(self, provider: str) -> dict:
        """Проверяет один провайдер и возвращает его статус"""
        result = {'available': False, 'balance': None, 'error': None}
        
        try:
            if provider == 'openai':
                api_key = getattr(settings, 'TRANSLATION_API_KEY', '')
                if not api_key:
                    result['error'] = 'API ключ не настроен'
                    return result
                
                # Проверяем ключ через GET /v1/models
                resp = http_requests.get(
                    'https://api.openai.com/v1/models',
                    headers={'Authorization': f'Bearer {api_key}'},
                    timeout=10
                )
                if resp.status_code == 200:
                    result['available'] = True
                    # Пробуем получить баланс
                    try:
                        billing_resp = http_requests.get(
                            'https://api.openai.com/v1/organization/costs?start_time=2025-01-01&limit=1',
                            headers={'Authorization': f'Bearer {api_key}'},
                            timeout=10
                        )
                        if billing_resp.status_code == 200:
                            data = billing_resp.json()
                            if 'data' in data and len(data['data']) > 0:
                                result['balance'] = data['data'][0].get('results', {}).get('amount', {}).get('value')
                    except Exception:
                        pass  # Баланс не обязателен
                else:
                    result['error'] = f'HTTP {resp.status_code}: {resp.text[:200]}'
            
            elif provider == 'anthropic':
                api_key = getattr(settings, 'ANTHROPIC_API_KEY', '')
                if not api_key:
                    result['error'] = 'API ключ не настроен'
                    return result
                
                # Проверяем ключ через минимальный запрос
                resp = http_requests.post(
                    'https://api.anthropic.com/v1/messages',
                    headers={
                        'x-api-key': api_key,
                        'anthropic-version': '2023-06-01',
                        'content-type': 'application/json'
                    },
                    json={
                        'model': 'claude-3-5-haiku-20241022',
                        'max_tokens': 1,
                        'messages': [{'role': 'user', 'content': 'Hi'}]
                    },
                    timeout=15
                )
                if resp.status_code in (200, 201):
                    result['available'] = True
                elif resp.status_code == 401:
                    result['error'] = 'Неверный API ключ'
                elif resp.status_code == 429:
                    result['available'] = True
                    result['error'] = 'Rate limit (ключ рабочий, но превышен лимит запросов)'
                else:
                    result['error'] = f'HTTP {resp.status_code}: {resp.text[:200]}'
            
            elif provider == 'grok':
                api_key = getattr(settings, 'XAI_API_KEY', '')
                if not api_key:
                    result['error'] = 'API ключ не настроен'
                    return result
                
                resp = http_requests.get(
                    'https://api.x.ai/v1/models',
                    headers={'Authorization': f'Bearer {api_key}'},
                    timeout=10
                )
                if resp.status_code == 200:
                    result['available'] = True
                else:
                    result['error'] = f'HTTP {resp.status_code}: {resp.text[:200]}'
            
            elif provider == 'gemini':
                api_key = getattr(settings, 'GEMINI_API_KEY', '')
                if not api_key:
                    result['error'] = 'API ключ не настроен'
                    return result
                
                resp = http_requests.get(
                    f'https://generativelanguage.googleapis.com/v1/models?key={api_key}',
                    timeout=10
                )
                if resp.status_code == 200:
                    result['available'] = True
                else:
                    result['error'] = f'HTTP {resp.status_code}: {resp.text[:200]}'
            
            else:
                result['error'] = f'Неизвестный провайдер: {provider}'
        
        except http_requests.exceptions.Timeout:
            result['error'] = 'Таймаут при проверке провайдера'
        except Exception as e:
            result['error'] = f'Ошибка: {str(e)}'
        
        return result


class NewsDiscoveryRunViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet для просмотра истории запусков поиска.
    Только администраторы могут просматривать историю.
    """
    permission_classes = [permissions.IsAdminUser]
    
    def get_queryset(self):
        return NewsDiscoveryRun.objects.all()
    
    def get_serializer_class(self):
        if self.action == 'list':
            return NewsDiscoveryRunListSerializer
        return NewsDiscoveryRunSerializer
    
    @action(detail=True, methods=['get'])
    def api_calls(self, request, pk=None):
        """Получить все API вызовы для запуска"""
        run = self.get_object()
        calls = run.api_calls.all()
        serializer = DiscoveryAPICallSerializer(calls, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Получить агрегированную статистику по всем запускам"""
        runs = NewsDiscoveryRun.objects.all()
        
        # Период фильтрации
        days = request.query_params.get('days', None)
        if days:
            try:
                days_int = int(days)
                from_date = timezone.now() - timezone.timedelta(days=days_int)
                runs = runs.filter(created_at__gte=from_date)
            except ValueError:
                pass
        
        # Агрегация
        aggregates = runs.aggregate(
            total_runs=Count('id'),
            total_news_found=Sum('news_found'),
            total_cost_usd=Sum('estimated_cost_usd'),
            total_requests=Sum('total_requests'),
            total_input_tokens=Sum('total_input_tokens'),
            total_output_tokens=Sum('total_output_tokens'),
        )
        
        # Расчет средних значений
        total_runs = aggregates['total_runs'] or 0
        total_news = aggregates['total_news_found'] or 0
        total_cost = aggregates['total_cost_usd'] or Decimal('0')
        
        avg_efficiency = 0
        if total_cost > 0:
            avg_efficiency = float(total_news / float(total_cost))
        
        avg_cost_per_run = Decimal('0')
        if total_runs > 0:
            avg_cost_per_run = total_cost / total_runs
        
        # Статистика по провайдерам (агрегация из всех provider_stats)
        provider_breakdown = {}
        for run in runs:
            if run.provider_stats:
                for provider, stats in run.provider_stats.items():
                    if provider not in provider_breakdown:
                        provider_breakdown[provider] = {
                            'requests': 0,
                            'input_tokens': 0,
                            'output_tokens': 0,
                            'cost': 0,
                            'errors': 0
                        }
                    for key in ['requests', 'input_tokens', 'output_tokens', 'cost', 'errors']:
                        provider_breakdown[provider][key] += stats.get(key, 0)
        
        result = {
            'total_runs': total_runs,
            'total_news_found': total_news,
            'total_cost_usd': total_cost,
            'total_requests': aggregates['total_requests'] or 0,
            'total_input_tokens': aggregates['total_input_tokens'] or 0,
            'total_output_tokens': aggregates['total_output_tokens'] or 0,
            'avg_efficiency': avg_efficiency,
            'avg_cost_per_run': avg_cost_per_run,
            'provider_breakdown': provider_breakdown
        }
        
        serializer = DiscoveryStatsSerializer(result)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def latest(self, request):
        """Получить последний запуск"""
        run = NewsDiscoveryRun.objects.first()
        if run:
            serializer = NewsDiscoveryRunSerializer(run)
            return Response(serializer.data)
        return Response({'detail': 'No discovery runs found'}, status=status.HTTP_404_NOT_FOUND)


class DiscoveryAPICallViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet для просмотра записей API вызовов.
    Только администраторы могут просматривать записи.
    """
    serializer_class = DiscoveryAPICallSerializer
    permission_classes = [permissions.IsAdminUser]
    
    def get_queryset(self):
        queryset = DiscoveryAPICall.objects.select_related(
            'discovery_run', 'resource', 'manufacturer'
        ).all()
        
        # Фильтрация по провайдеру
        provider = self.request.query_params.get('provider', None)
        if provider:
            queryset = queryset.filter(provider=provider)
        
        # Фильтрация по успешности
        success = self.request.query_params.get('success', None)
        if success is not None:
            success_bool = success.lower() in ('true', '1', 'yes')
            queryset = queryset.filter(success=success_bool)
        
        # Фильтрация по run_id
        run_id = self.request.query_params.get('run_id', None)
        if run_id:
            queryset = queryset.filter(discovery_run_id=run_id)
        
        return queryset
