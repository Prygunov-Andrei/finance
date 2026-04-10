import logging

from django.db import transaction

from accounting.models import Counterparty
from marketing.models import AvitoListing, ExecutorProfile

logger = logging.getLogger(__name__)


class ExecutorService:
    """CRUD и бизнес-логика для профилей исполнителей."""

    def convert_listing_to_executor(self, listing_id, extra_data=None):
        """Конвертировать AvitoListing в Counterparty + ExecutorProfile."""
        listing = AvitoListing.objects.get(pk=listing_id)

        if listing.status == AvitoListing.Status.CONVERTED and listing.executor_profile:
            return listing.executor_profile

        # Проверка дубликатов по avito_user_id
        if listing.seller_avito_id:
            existing = ExecutorProfile.objects.filter(
                avito_user_id=listing.seller_avito_id,
            ).select_related('counterparty').first()
            if existing:
                listing.executor_profile = existing
                listing.status = AvitoListing.Status.CONVERTED
                listing.save(update_fields=['executor_profile', 'status', 'updated_at'])
                logger.info('Листинг #%d привязан к существующему профилю #%d', listing_id, existing.pk)
                return existing

        with transaction.atomic():
            # Placeholder INN для физлиц без ИНН
            inn_placeholder = f'AV{(listing.seller_avito_id or str(listing.pk))[:10]}'

            counterparty = Counterparty(
                name=listing.seller_name or f'Исполнитель Avito #{listing.avito_item_id[:20]}',
                type=Counterparty.Type.VENDOR,
                vendor_subtype=Counterparty.VendorSubtype.EXECUTOR,
                legal_form=Counterparty.LegalForm.FIZ,
                inn=inn_placeholder,
                contact_info=f'Avito: {listing.url}',
            )
            counterparty.full_clean = lambda: None  # Skip INN validation for placeholder
            counterparty.save()

            profile = ExecutorProfile.objects.create(
                counterparty=counterparty,
                source=ExecutorProfile.Source.AVITO,
                avito_user_id=listing.seller_avito_id,
                avito_profile_url=(
                    f'https://www.avito.ru/user/{listing.seller_avito_id}'
                    if listing.seller_avito_id else ''
                ),
                city=listing.city,
                is_potential=True,
            )

            listing.executor_profile = profile
            listing.status = AvitoListing.Status.CONVERTED
            listing.save(update_fields=['executor_profile', 'status', 'updated_at'])

        logger.info(
            'Листинг #%d конвертирован в исполнителя #%d (Counterparty #%d)',
            listing_id, profile.pk, counterparty.pk,
        )
        return profile
