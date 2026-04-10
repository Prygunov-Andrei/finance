import logging

from django.utils import timezone

from marketing.models import AvitoConfig, AvitoPublishedListing, MarketingSyncLog
from proposals.models import MountingProposal

logger = logging.getLogger(__name__)


class AvitoPublisherService:
    """Публикация МП как объявления на Avito."""

    def publish_mounting_proposal(self, mp_id, dry_run=False):
        mp = MountingProposal.objects.select_related('object').get(pk=mp_id)
        listing_data = self._build_listing_data(mp)

        if dry_run:
            return {'status': 'dry_run', 'data': listing_data}

        published = AvitoPublishedListing.objects.create(
            mounting_proposal=mp,
            listing_title=listing_data['title'],
            listing_text=listing_data['description'],
            status=AvitoPublishedListing.Status.PENDING,
        )

        config = AvitoConfig.get()
        if not config.is_active:
            published.status = AvitoPublishedListing.Status.ERROR
            published.error_message = 'Интеграция с Avito не активна'
            published.save(update_fields=['status', 'error_message', 'updated_at'])
            return {'status': 'error', 'message': published.error_message}

        # TODO: Фаза 3 — реальный вызов Avito API
        # with AvitoAPIClient() as client:
        #     result = client.create_listing(listing_data)
        #     published.avito_item_id = result['id']
        #     published.avito_url = result['url']
        #     published.status = AvitoPublishedListing.Status.PUBLISHED
        #     published.published_at = timezone.now()
        #     published.save()

        published.status = AvitoPublishedListing.Status.ERROR
        published.error_message = 'Avito API клиент ещё не реализован (Фаза 3)'
        published.save(update_fields=['status', 'error_message', 'updated_at'])

        MarketingSyncLog.objects.create(
            sync_type=MarketingSyncLog.SyncType.AVITO_PUBLISH,
            status=MarketingSyncLog.Status.FAILED,
            items_processed=1,
            error_details=[{'mp_id': mp_id, 'error': published.error_message}],
        )

        return {'status': 'stub', 'published_id': published.pk}

    def _build_listing_data(self, mp):
        config = AvitoConfig.get()
        template = config.listing_template or (
            'Ищем монтажников для объекта «{object_name}» ({city}). '
            'Виды работ: {work_types}. '
            'Объём: {man_hours} чел/час, сумма: {total_amount} руб.'
        )

        object_name = mp.object.name if mp.object else ''
        city = getattr(mp.object, 'city', '') if mp.object else ''

        description = template.format(
            object_name=object_name,
            city=city,
            work_types='монтаж',
            man_hours=mp.man_hours,
            total_amount=mp.total_amount,
        )

        return {
            'title': f'Ищем монтажников: {object_name}'[:50],
            'description': description,
            'category_id': config.listing_category_id,
        }
