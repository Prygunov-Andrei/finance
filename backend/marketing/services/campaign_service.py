import logging
from decimal import Decimal

from django.utils import timezone

from marketing.models import (
    Campaign,
    CampaignRecipient,
    ContactHistory,
    ExecutorProfile,
    MarketingSyncLog,
)

logger = logging.getLogger(__name__)


class CampaignService:
    """Сервис отправки рассылок."""

    def resolve_recipients(self, campaign):
        """Подобрать получателей по фильтрам кампании."""
        qs = ExecutorProfile.objects.select_related('counterparty')

        if campaign.filter_specializations:
            qs = qs.filter(specializations__overlap=campaign.filter_specializations)

        if campaign.filter_cities:
            qs = qs.filter(city__in=campaign.filter_cities)

        if campaign.filter_is_potential is not None:
            qs = qs.filter(is_potential=campaign.filter_is_potential)

        if campaign.filter_is_available is not None:
            qs = qs.filter(is_available=campaign.filter_is_available)

        # Для email — только с email, для SMS — только с телефоном
        if campaign.campaign_type == Campaign.CampaignType.EMAIL:
            qs = qs.exclude(email='')
        elif campaign.campaign_type == Campaign.CampaignType.SMS:
            qs = qs.exclude(phone='')

        return qs

    def preview_campaign(self, campaign_id):
        """Предпросмотр: количество получателей, примерная стоимость."""
        campaign = Campaign.objects.get(pk=campaign_id)
        recipients = self.resolve_recipients(campaign)
        count = recipients.count()

        return {
            'total_recipients': count,
            'recipients_preview': list(
                recipients.values(
                    'id', 'counterparty__name', 'phone', 'email', 'city',
                )[:20]
            ),
            'estimated_sms_cost': (
                str(count * Decimal('3.00'))
                if campaign.campaign_type == Campaign.CampaignType.SMS
                else None
            ),
        }

    def execute_campaign(self, campaign_id):
        """Отправить рассылку."""
        campaign = Campaign.objects.get(pk=campaign_id)

        if campaign.status not in (Campaign.Status.DRAFT, Campaign.Status.SCHEDULED, Campaign.Status.SENDING):
            raise ValueError(f'Нельзя отправить рассылку в статусе «{campaign.get_status_display()}»')

        campaign.status = Campaign.Status.SENDING
        campaign.save(update_fields=['status', 'updated_at'])

        recipients_qs = self.resolve_recipients(campaign)

        # Создать CampaignRecipient записи
        bulk = [
            CampaignRecipient(campaign=campaign, executor_profile=ep)
            for ep in recipients_qs
        ]
        CampaignRecipient.objects.bulk_create(bulk, ignore_conflicts=True)

        campaign.total_recipients = campaign.recipients.count()
        campaign.save(update_fields=['total_recipients', 'updated_at'])

        sent = 0
        errors = 0

        for recipient in campaign.recipients.filter(status=CampaignRecipient.Status.PENDING):
            try:
                # TODO: Фаза 4 — реальная отправка через UnisenderClient
                # if campaign.campaign_type == Campaign.CampaignType.EMAIL:
                #     client.send_email(...)
                # else:
                #     client.send_sms(...)

                recipient.status = CampaignRecipient.Status.SENT
                recipient.sent_at = timezone.now()
                sent += 1

                ContactHistory.objects.create(
                    executor_profile=recipient.executor_profile,
                    channel=(
                        ContactHistory.Channel.EMAIL
                        if campaign.campaign_type == Campaign.CampaignType.EMAIL
                        else ContactHistory.Channel.SMS
                    ),
                    direction=ContactHistory.Direction.OUT,
                    subject=campaign.subject,
                    body=campaign.body[:500],
                    campaign=campaign,
                )
            except Exception as e:
                recipient.status = CampaignRecipient.Status.FAILED
                recipient.error_message = str(e)[:500]
                errors += 1
                logger.warning('Ошибка отправки получателю #%d: %s', recipient.pk, e)

            recipient.save(update_fields=['status', 'error_message', 'sent_at', 'updated_at'])

        campaign.sent_count = sent
        campaign.error_count = errors
        campaign.status = Campaign.Status.COMPLETED
        campaign.sent_at = timezone.now()
        campaign.save(update_fields=['sent_count', 'error_count', 'status', 'sent_at', 'updated_at'])

        sync_type = (
            MarketingSyncLog.SyncType.EMAIL_CAMPAIGN
            if campaign.campaign_type == Campaign.CampaignType.EMAIL
            else MarketingSyncLog.SyncType.SMS_CAMPAIGN
        )
        MarketingSyncLog.objects.create(
            sync_type=sync_type,
            status=MarketingSyncLog.Status.SUCCESS if errors == 0 else MarketingSyncLog.Status.PARTIAL,
            items_processed=sent + errors,
            items_created=sent,
            items_errors=errors,
        )

        logger.info(
            'Рассылка #%d завершена: отправлено=%d, ошибок=%d',
            campaign_id, sent, errors,
        )
