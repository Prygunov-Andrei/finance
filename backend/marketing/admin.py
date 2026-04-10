from django.contrib import admin

from .models import (
    AvitoConfig,
    AvitoListing,
    AvitoPublishedListing,
    AvitoSearchKeyword,
    Campaign,
    CampaignRecipient,
    ContactHistory,
    ExecutorProfile,
    MarketingSyncLog,
    UnisenderConfig,
)


@admin.register(ExecutorProfile)
class ExecutorProfileAdmin(admin.ModelAdmin):
    list_display = ['counterparty', 'city', 'source', 'is_potential', 'is_available', 'rating', 'created_at']
    list_filter = ['source', 'is_potential', 'is_available', 'is_verified', 'city']
    search_fields = ['counterparty__name', 'counterparty__short_name', 'phone', 'email', 'city']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['counterparty']


@admin.register(AvitoConfig)
class AvitoConfigAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'is_active', 'auto_publish_mp', 'search_enabled', 'updated_at']
    readonly_fields = ['created_at', 'updated_at', 'token_expires_at']


@admin.register(AvitoSearchKeyword)
class AvitoSearchKeywordAdmin(admin.ModelAdmin):
    list_display = ['keyword', 'is_active', 'results_count', 'last_scan_at']
    list_filter = ['is_active']


@admin.register(AvitoListing)
class AvitoListingAdmin(admin.ModelAdmin):
    list_display = ['title', 'city', 'seller_name', 'status', 'discovered_at']
    list_filter = ['status', 'city']
    search_fields = ['title', 'seller_name', 'city']
    readonly_fields = ['created_at', 'updated_at', 'discovered_at']
    raw_id_fields = ['keyword', 'executor_profile']


@admin.register(AvitoPublishedListing)
class AvitoPublishedListingAdmin(admin.ModelAdmin):
    list_display = ['mounting_proposal', 'status', 'views_count', 'contacts_count', 'published_at']
    list_filter = ['status']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['mounting_proposal']


@admin.register(ContactHistory)
class ContactHistoryAdmin(admin.ModelAdmin):
    list_display = ['executor_profile', 'channel', 'direction', 'subject', 'created_at']
    list_filter = ['channel', 'direction']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['executor_profile', 'avito_listing', 'campaign', 'created_by']


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_display = ['name', 'campaign_type', 'status', 'total_recipients', 'sent_count', 'error_count', 'created_at']
    list_filter = ['campaign_type', 'status']
    readonly_fields = ['created_at', 'updated_at', 'sent_at']
    raw_id_fields = ['attachment_mp', 'attachment_estimate', 'created_by']


@admin.register(CampaignRecipient)
class CampaignRecipientAdmin(admin.ModelAdmin):
    list_display = ['campaign', 'executor_profile', 'status', 'sent_at']
    list_filter = ['status']
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['campaign', 'executor_profile']


@admin.register(UnisenderConfig)
class UnisenderConfigAdmin(admin.ModelAdmin):
    list_display = ['__str__', 'is_active', 'sender_email', 'updated_at']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(MarketingSyncLog)
class MarketingSyncLogAdmin(admin.ModelAdmin):
    list_display = ['sync_type', 'status', 'items_processed', 'items_created', 'items_errors', 'duration_seconds', 'created_at']
    list_filter = ['sync_type', 'status']
    readonly_fields = ['created_at', 'updated_at']
