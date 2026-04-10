from rest_framework import serializers

from accounting.models import Counterparty

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


# ---------------------------------------------------------------------------
# ExecutorProfile
# ---------------------------------------------------------------------------

class CounterpartyNestedSerializer(serializers.ModelSerializer):
    class Meta:
        model = Counterparty
        fields = ['id', 'name', 'short_name', 'inn', 'legal_form', 'type', 'vendor_subtype']
        read_only_fields = fields


class ExecutorProfileListSerializer(serializers.ModelSerializer):
    counterparty_name = serializers.CharField(source='counterparty.name', read_only=True)
    counterparty_short_name = serializers.CharField(source='counterparty.short_name', read_only=True)
    contact_history_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = ExecutorProfile
        fields = [
            'id', 'counterparty', 'counterparty_name', 'counterparty_short_name',
            'source', 'phone', 'email', 'contact_person', 'city', 'region',
            'specializations', 'hourly_rate', 'daily_rate', 'team_size',
            'rating', 'is_potential', 'is_verified', 'is_available',
            'avito_user_id', 'contact_history_count', 'created_at',
        ]


class ExecutorProfileDetailSerializer(serializers.ModelSerializer):
    counterparty = CounterpartyNestedSerializer(read_only=True)
    contact_history_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = ExecutorProfile
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class ExecutorProfileCreateSerializer(serializers.ModelSerializer):
    """Создание профиля с автоматическим созданием Counterparty."""

    # Поля для создания Counterparty
    name = serializers.CharField(write_only=True, help_text='Полное наименование контрагента')
    short_name = serializers.CharField(write_only=True, required=False, default='')
    inn = serializers.CharField(write_only=True, help_text='ИНН')
    legal_form = serializers.ChoiceField(
        write_only=True,
        choices=Counterparty.LegalForm.choices,
        default=Counterparty.LegalForm.FIZ,
    )

    class Meta:
        model = ExecutorProfile
        exclude = ['counterparty', 'created_at', 'updated_at']

    def create(self, validated_data):
        name = validated_data.pop('name')
        short_name = validated_data.pop('short_name', '')
        inn = validated_data.pop('inn')
        legal_form = validated_data.pop('legal_form', Counterparty.LegalForm.FIZ)

        counterparty = Counterparty.objects.create(
            name=name,
            short_name=short_name,
            type=Counterparty.Type.VENDOR,
            vendor_subtype=Counterparty.VendorSubtype.EXECUTOR,
            legal_form=legal_form,
            inn=inn,
        )
        return ExecutorProfile.objects.create(counterparty=counterparty, **validated_data)


class ExecutorProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExecutorProfile
        exclude = ['counterparty', 'created_at', 'updated_at']


# ---------------------------------------------------------------------------
# AvitoConfig (singleton)
# ---------------------------------------------------------------------------

class AvitoConfigSerializer(serializers.ModelSerializer):
    is_token_valid = serializers.BooleanField(read_only=True)

    class Meta:
        model = AvitoConfig
        exclude = ['access_token']
        read_only_fields = ['id', 'created_at', 'updated_at', 'token_expires_at']


# ---------------------------------------------------------------------------
# AvitoSearchKeyword
# ---------------------------------------------------------------------------

class AvitoSearchKeywordSerializer(serializers.ModelSerializer):
    class Meta:
        model = AvitoSearchKeyword
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'last_scan_at', 'results_count']


# ---------------------------------------------------------------------------
# AvitoListing
# ---------------------------------------------------------------------------

class AvitoListingListSerializer(serializers.ModelSerializer):
    keyword_text = serializers.CharField(source='keyword.keyword', read_only=True, default='')
    executor_name = serializers.CharField(source='executor_profile.counterparty.name', read_only=True, default='')

    class Meta:
        model = AvitoListing
        fields = [
            'id', 'avito_item_id', 'url', 'title', 'price', 'city', 'category',
            'seller_name', 'seller_avito_id', 'status', 'keyword', 'keyword_text',
            'executor_profile', 'executor_name', 'discovered_at',
        ]


class AvitoListingDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = AvitoListing
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'discovered_at']


class AvitoListingCreateSerializer(serializers.ModelSerializer):
    """Ручное добавление объявления."""

    class Meta:
        model = AvitoListing
        fields = [
            'avito_item_id', 'url', 'title', 'description', 'price',
            'city', 'category', 'seller_name', 'seller_avito_id',
            'keyword', 'published_at',
        ]


# ---------------------------------------------------------------------------
# AvitoPublishedListing
# ---------------------------------------------------------------------------

class AvitoPublishedListingSerializer(serializers.ModelSerializer):
    mp_number = serializers.CharField(source='mounting_proposal.number', read_only=True)
    mp_name = serializers.CharField(source='mounting_proposal.name', read_only=True)
    object_name = serializers.CharField(source='mounting_proposal.object.name', read_only=True, default='')

    class Meta:
        model = AvitoPublishedListing
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


# ---------------------------------------------------------------------------
# ContactHistory
# ---------------------------------------------------------------------------

class ContactHistorySerializer(serializers.ModelSerializer):
    executor_name = serializers.CharField(source='executor_profile.counterparty.name', read_only=True, default='')
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ContactHistory
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ''


class ContactHistoryCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactHistory
        fields = ['channel', 'direction', 'subject', 'body', 'avito_listing']


# ---------------------------------------------------------------------------
# Campaign
# ---------------------------------------------------------------------------

class CampaignListSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        fields = [
            'id', 'name', 'campaign_type', 'status',
            'total_recipients', 'sent_count', 'delivered_count', 'error_count',
            'scheduled_at', 'sent_at', 'created_by', 'created_by_name', 'created_at',
        ]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ''


class CampaignDetailSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    mp_name = serializers.CharField(source='attachment_mp.name', read_only=True, default='')
    estimate_name = serializers.CharField(source='attachment_estimate.name', read_only=True, default='')

    class Meta:
        model = Campaign
        fields = '__all__'
        read_only_fields = [
            'created_at', 'updated_at', 'sent_at',
            'total_recipients', 'sent_count', 'delivered_count', 'error_count',
        ]

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return ''


class CampaignCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campaign
        fields = [
            'name', 'campaign_type', 'subject', 'body',
            'attachment_mp', 'attachment_estimate',
            'filter_specializations', 'filter_cities',
            'filter_is_potential', 'filter_is_available',
            'scheduled_at',
        ]


# ---------------------------------------------------------------------------
# CampaignRecipient
# ---------------------------------------------------------------------------

class CampaignRecipientSerializer(serializers.ModelSerializer):
    executor_name = serializers.CharField(source='executor_profile.counterparty.name', read_only=True, default='')
    executor_phone = serializers.CharField(source='executor_profile.phone', read_only=True, default='')
    executor_email = serializers.CharField(source='executor_profile.email', read_only=True, default='')

    class Meta:
        model = CampaignRecipient
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


# ---------------------------------------------------------------------------
# UnisenderConfig (singleton)
# ---------------------------------------------------------------------------

class UnisenderConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnisenderConfig
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


# ---------------------------------------------------------------------------
# MarketingSyncLog
# ---------------------------------------------------------------------------

class MarketingSyncLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarketingSyncLog
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
