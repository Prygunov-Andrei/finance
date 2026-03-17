from django.contrib import admin
from django.shortcuts import render, redirect
from django.urls import path
from django.utils.html import format_html
from django import forms
from modeltranslation.admin import TranslationAdmin
from .models import (
    NewsPost, NewsMedia, Comment, NewsDiscoveryRun, NewsDiscoveryStatus,
    SearchConfiguration, DiscoveryAPICall
)
from .services import NewsImportService, publish_news_post, publish_multiple_news_posts

class ImportNewsForm(forms.Form):
    zip_file = forms.FileField()

@admin.register(NewsPost)
class NewsPostAdmin(TranslationAdmin):
    list_display = ('title', 'source_url_link', 'pub_date', 'author', 'status', 'is_no_news_found', 'created_at')
    search_fields = ('title',)
    list_filter = ('status', 'source_language', 'is_no_news_found', 'created_at')
    readonly_fields = ('source_url_link', 'created_at', 'updated_at', 'is_no_news_found')
    actions = ['publish_selected_news', 'mark_as_draft']
    fieldsets = (
        ('Основная информация', {
            'fields': ('title', 'body', 'source_url', 'source_url_link', 'status', 'source_language', 'author', 'pub_date')
        }),
        ('Метаданные', {
            'fields': ('created_at', 'updated_at', 'is_no_news_found'),
            'classes': ('collapse',)
        }),
    )
    change_list_template = "admin/news_changelist.html"
    
    def source_url_link(self, obj):
        """Отображает source_url как кликабельную ссылку"""
        if obj.source_url:
            return format_html('<a href="{}" target="_blank" rel="noopener noreferrer">{}</a>', 
                             obj.source_url, obj.source_url[:60] + '...' if len(obj.source_url) > 60 else obj.source_url)
        return '-'
    source_url_link.short_description = 'Источник'
    source_url_link.admin_order_field = 'source_url'
    
    def publish_selected_news(self, request, queryset):
        """
        Публикует выбранные новости: переводит на все языки и меняет статус на 'published'.
        
        Работает только с черновиками (status='draft').
        После оптимизации промптов новости создаются только с русским текстом,
        поэтому перед публикацией добавляются переводы на en, de, pt.
        """
        # Фильтруем только черновики
        drafts = queryset.filter(status='draft')
        
        if not drafts.exists():
            self.message_user(
                request,
                "Не выбрано ни одного черновика для публикации.",
                level='WARNING'
            )
            return
        
        # Публикуем с переводами
        result = publish_multiple_news_posts(drafts)
        
        # Сообщения о результатах
        if result['published'] > 0:
            self.message_user(
                request,
                f"✅ Успешно опубликовано новостей: {result['published']} (с переводами на en, de, pt)",
                level='SUCCESS'
            )
        
        if result['errors'] > 0:
            error_details = '\n'.join(result['error_messages'][:5])  # Показываем первые 5 ошибок
            self.message_user(
                request,
                f"❌ Ошибок при публикации: {result['errors']}\n{error_details}",
                level='ERROR'
            )
    
    publish_selected_news.short_description = "✅ Опубликовать выбранные новости (с переводом)"
    
    def mark_as_draft(self, request, queryset):
        """Возвращает опубликованные новости обратно в черновики"""
        updated = queryset.filter(status='published').update(status='draft')
        
        if updated > 0:
            self.message_user(
                request,
                f"Возвращено в черновики: {updated}",
                level='SUCCESS'
            )
        else:
            self.message_user(
                request,
                "Не выбрано ни одной опубликованной новости.",
                level='WARNING'
            )
    
    mark_as_draft.short_description = "📝 Вернуть в черновики"

    def get_urls(self):
        urls = super().get_urls()
        my_urls = [
            path('import-zip/', self.import_zip, name='news_import_zip'),
        ]
        return my_urls + urls

    def import_zip(self, request):
        if request.method == "POST":
            form = ImportNewsForm(request.POST, request.FILES)
            if form.is_valid():
                zip_file = request.FILES['zip_file']
                
                # Save zip temporarily
                # Or pass the file object directly if service supports it (service currently expects path)
                # Let's save it to a temporary location
                import tempfile
                import os
                
                # Create a named temporary file
                with tempfile.NamedTemporaryFile(delete=False, suffix='.zip') as tmp:
                    for chunk in zip_file.chunks():
                        tmp.write(chunk)
                    tmp_path = tmp.name
                
                try:
                    service = NewsImportService(tmp_path, user=request.user)
                    service.process()
                    self.message_user(request, "News imported successfully")
                except Exception as e:
                    self.message_user(request, f"Error: {str(e)}", level="error")
                finally:
                    os.unlink(tmp_path)
                
                return redirect("..")
        else:
            form = ImportNewsForm()
            
        context = {
            'form': form,
            'title': 'Import News from ZIP',
            'opts': self.model._meta,
        }
        return render(request, "admin/import_news.html", context)

@admin.register(NewsMedia)
class NewsMediaAdmin(admin.ModelAdmin):
    list_display = ('original_name', 'media_type', 'news_post')


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ('author', 'news_post', 'text_preview', 'created_at')
    list_filter = ('created_at', 'news_post')
    search_fields = ('text', 'author__email', 'news_post__title')
    readonly_fields = ('created_at', 'updated_at')
    
    def text_preview(self, obj):
        return obj.text[:100] + '...' if len(obj.text) > 100 else obj.text
    text_preview.short_description = 'Text Preview'


@admin.register(SearchConfiguration)
class SearchConfigurationAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'primary_provider', 'grok_model', 'max_search_results', 
                    'temperature', 'updated_at')
    list_filter = ('is_active', 'primary_provider')
    search_fields = ('name',)
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        ('Основные настройки', {
            'fields': ('name', 'is_active')
        }),
        ('Провайдеры', {
            'fields': ('primary_provider', 'fallback_chain')
        }),
        ('Параметры LLM', {
            'fields': ('temperature', 'timeout', 'max_news_per_resource', 'delay_between_requests')
        }),
        ('Grok Web Search', {
            'fields': ('max_search_results', 'search_context_size')
        }),
        ('Модели', {
            'fields': ('grok_model', 'anthropic_model', 'gemini_model', 'openai_model'),
            'classes': ('collapse',)
        }),
        ('Тарифы Grok (USD за 1M токенов)', {
            'fields': ('grok_input_price', 'grok_output_price'),
            'classes': ('collapse',)
        }),
        ('Тарифы Anthropic (USD за 1M токенов)', {
            'fields': ('anthropic_input_price', 'anthropic_output_price'),
            'classes': ('collapse',)
        }),
        ('Тарифы Gemini (USD за 1M токенов)', {
            'fields': ('gemini_input_price', 'gemini_output_price'),
            'classes': ('collapse',)
        }),
        ('Тарифы OpenAI (USD за 1M токенов)', {
            'fields': ('openai_input_price', 'openai_output_price'),
            'classes': ('collapse',)
        }),
        ('Метаданные', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(NewsDiscoveryRun)
class NewsDiscoveryRunAdmin(admin.ModelAdmin):
    list_display = ('id', 'last_search_date', 'news_found', 'estimated_cost_display', 
                    'duration_display', 'efficiency_display', 'created_at')
    readonly_fields = ('created_at', 'updated_at', 'config_snapshot', 'provider_stats',
                       'started_at', 'finished_at', 'total_requests', 'total_input_tokens',
                       'total_output_tokens', 'estimated_cost_usd', 'news_found', 
                       'news_duplicates', 'resources_processed', 'resources_failed',
                       'duration_display', 'efficiency_display')
    list_filter = ('last_search_date', 'created_at')
    
    fieldsets = (
        ('Результаты', {
            'fields': ('last_search_date', 'news_found', 'news_duplicates', 
                       'resources_processed', 'resources_failed')
        }),
        ('Время', {
            'fields': ('started_at', 'finished_at', 'duration_display')
        }),
        ('Стоимость и токены', {
            'fields': ('estimated_cost_usd', 'total_requests', 'total_input_tokens', 
                       'total_output_tokens', 'efficiency_display')
        }),
        ('Статистика по провайдерам', {
            'fields': ('provider_stats',),
            'classes': ('collapse',)
        }),
        ('Конфигурация', {
            'fields': ('config_snapshot',),
            'classes': ('collapse',)
        }),
        ('Метаданные', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def estimated_cost_display(self, obj):
        return f"${obj.estimated_cost_usd:.4f}"
    estimated_cost_display.short_description = 'Cost (USD)'
    estimated_cost_display.admin_order_field = 'estimated_cost_usd'
    
    def duration_display(self, obj):
        return obj.get_duration_display()
    duration_display.short_description = 'Duration'
    
    def efficiency_display(self, obj):
        eff = obj.get_efficiency()
        if eff > 0:
            return f"{eff:.1f} news/$"
        return "-"
    efficiency_display.short_description = 'Efficiency'


class DiscoveryAPICallInline(admin.TabularInline):
    model = DiscoveryAPICall
    extra = 0
    readonly_fields = ('provider', 'model', 'input_tokens', 'output_tokens', 
                       'cost_usd', 'duration_ms', 'success', 'news_extracted', 'created_at')
    fields = ('provider', 'resource', 'input_tokens', 'output_tokens', 
              'cost_usd', 'duration_ms', 'success', 'news_extracted')
    can_delete = False
    
    def has_add_permission(self, request, obj=None):
        return False


@admin.register(DiscoveryAPICall)
class DiscoveryAPICallAdmin(admin.ModelAdmin):
    list_display = ('id', 'provider', 'model', 'resource_name', 'input_tokens', 
                    'output_tokens', 'cost_display', 'duration_ms', 'success', 
                    'news_extracted', 'created_at')
    list_filter = ('provider', 'success', 'created_at')
    search_fields = ('resource__name', 'manufacturer__name', 'error_message')
    readonly_fields = ('discovery_run', 'resource', 'manufacturer', 'provider', 'model',
                       'input_tokens', 'output_tokens', 'cost_usd', 'duration_ms',
                       'success', 'error_message', 'news_extracted', 'created_at')
    
    def resource_name(self, obj):
        if obj.resource:
            return obj.resource.name
        if obj.manufacturer:
            return f"[M] {obj.manufacturer.name}"
        return "-"
    resource_name.short_description = 'Resource'
    
    def cost_display(self, obj):
        return f"${obj.cost_usd:.6f}"
    cost_display.short_description = 'Cost'
    cost_display.admin_order_field = 'cost_usd'


@admin.register(NewsDiscoveryStatus)
class NewsDiscoveryStatusAdmin(admin.ModelAdmin):
    list_display = ('status', 'search_type', 'provider', 'processed_count', 'total_count', 
                    'get_progress_percent_display', 'created_at', 'updated_at')
    readonly_fields = ('created_at', 'updated_at', 'get_progress_percent_display')
    list_filter = ('status', 'search_type', 'provider', 'created_at')
    
    def get_progress_percent_display(self, obj):
        return f"{obj.get_progress_percent()}%"
    get_progress_percent_display.short_description = 'Progress'
