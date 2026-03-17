"""Тесты моделей api_public — Заход 0+1."""
import pytest
from datetime import timedelta
from decimal import Decimal
from django.db import IntegrityError
from django.utils import timezone

from api_public.models import (
    EstimateRequest, EstimateRequestFile, EstimateRequestVersion,
    PublicPortalConfig, PublicPricingConfig, CallbackRequest,
)
from api_public.tests.factories import (
    EstimateRequestFactory,
    EstimateRequestFileFactory,
    EstimateRequestVersionFactory,
    PublicPricingConfigFactory,
    CallbackRequestFactory,
)


# =========================================================================
# EstimateRequest
# =========================================================================

class TestEstimateRequest:
    """Тесты модели EstimateRequest."""

    def test_access_token_auto_generated(self, db):
        """access_token генерируется автоматически при создании."""
        req = EstimateRequestFactory()
        assert req.access_token
        assert len(req.access_token) >= 32

    def test_access_token_unique(self, db):
        """access_token уникален для каждого запроса."""
        req1 = EstimateRequestFactory()
        req2 = EstimateRequestFactory()
        assert req1.access_token != req2.access_token

    def test_access_token_not_overwritten(self, db):
        """Существующий access_token не перезаписывается при save()."""
        req = EstimateRequestFactory()
        original_token = req.access_token
        req.project_name = 'Обновлённый проект'
        req.save()
        req.refresh_from_db()
        assert req.access_token == original_token

    def test_expires_at_auto_set(self, db):
        """expires_at автоматически ставится на created_at + 30 дней."""
        req = EstimateRequestFactory()
        assert req.expires_at is not None
        # Допуск 1 минута (на задержку между timezone.now() и save)
        expected = timezone.now() + timedelta(days=30)
        assert abs((req.expires_at - expected).total_seconds()) < 60

    def test_expires_at_not_overwritten(self, db):
        """Существующий expires_at не перезаписывается при save()."""
        custom_expiry = timezone.now() + timedelta(days=7)
        req = EstimateRequestFactory(expires_at=custom_expiry)
        req.save()
        req.refresh_from_db()
        assert abs((req.expires_at - custom_expiry).total_seconds()) < 1

    def test_is_expired_false(self, db):
        """is_expired = False для свежего запроса."""
        req = EstimateRequestFactory()
        assert not req.is_expired

    def test_is_expired_true(self, db):
        """is_expired = True для просроченного запроса."""
        req = EstimateRequestFactory(
            expires_at=timezone.now() - timedelta(days=1),
        )
        assert req.is_expired

    def test_default_status(self, db):
        """Статус по умолчанию — UPLOADED."""
        req = EstimateRequestFactory()
        assert req.status == EstimateRequest.Status.UPLOADED

    def test_all_statuses_valid(self):
        """Все статусы из TextChoices корректны."""
        expected = {
            'uploaded', 'parsing', 'matching', 'review',
            'rfq_sent', 'ready', 'delivered', 'error',
        }
        actual = {s[0] for s in EstimateRequest.Status.choices}
        assert actual == expected

    @pytest.mark.parametrize('status,expected', [
        ('error', 0),
        ('uploaded', 5),
        ('ready', 100),
        ('delivered', 100),
        ('review', 80),
        ('rfq_sent', 85),
    ])
    def test_progress_percent_static(self, db, status, expected):
        """progress_percent для статусов с фиксированным значением."""
        req = EstimateRequestFactory(status=status)
        assert req.progress_percent == expected

    def test_progress_percent_parsing(self, db):
        """progress_percent при парсинге — 5-40% по файлам."""
        req = EstimateRequestFactory(
            status='parsing', total_files=10, processed_files=5,
        )
        # 5 + (5/10) * 35 = 5 + 17.5 = 22
        assert req.progress_percent == 22

    def test_progress_percent_matching(self, db):
        """progress_percent при матчинге — 40-75% по позициям."""
        req = EstimateRequestFactory(
            status='matching', total_spec_items=20,
            matched_exact=10, matched_analog=5, unmatched=5,
        )
        # 40 + (20/20) * 35 = 40 + 35 = 75
        assert req.progress_percent == 75

    def test_progress_percent_parsing_zero_files(self, db):
        """progress_percent при parsing с 0 файлов — базовое значение 5."""
        req = EstimateRequestFactory(status='parsing', total_files=0)
        assert req.progress_percent == 5

    def test_progress_percent_matching_zero_items(self, db):
        """progress_percent при matching с 0 позиций — базовое значение 40."""
        req = EstimateRequestFactory(status='matching', total_spec_items=0)
        assert req.progress_percent == 40

    def test_str(self, db):
        """__str__ содержит ID, название проекта и email."""
        req = EstimateRequestFactory(
            project_name='Тестовый проект',
            email='test@example.com',
        )
        s = str(req)
        assert 'Тестовый проект' in s
        assert 'test@example.com' in s

    def test_ordering(self, db):
        """Записи упорядочены по -created_at (новые первыми)."""
        req1 = EstimateRequestFactory()
        req2 = EstimateRequestFactory()
        qs = EstimateRequest.objects.all()
        assert list(qs) == [req2, req1]

    def test_cascade_delete_files(self, db):
        """При удалении запроса удаляются файлы."""
        req = EstimateRequestFactory()
        EstimateRequestFileFactory(request=req)
        EstimateRequestFileFactory(request=req)
        assert EstimateRequestFile.objects.count() == 2
        req.delete()
        assert EstimateRequestFile.objects.count() == 0

    def test_cascade_delete_callbacks(self, db):
        """При удалении запроса удаляются заявки на звонок."""
        req = EstimateRequestFactory()
        CallbackRequestFactory(request=req)
        assert CallbackRequest.objects.count() == 1
        req.delete()
        assert CallbackRequest.objects.count() == 0


# =========================================================================
# EstimateRequestFile
# =========================================================================

class TestEstimateRequestFile:
    """Тесты модели EstimateRequestFile."""

    def test_all_parse_statuses_valid(self):
        """Все ParseStatus choices корректны."""
        expected = {'pending', 'parsing', 'done', 'partial', 'skipped', 'error'}
        actual = {s[0] for s in EstimateRequestFile.ParseStatus.choices}
        assert actual == expected

    def test_all_file_types_valid(self):
        """Все FileType choices корректны."""
        expected = {'spec', 'equip', 'drawing', 'excel', 'other'}
        actual = {s[0] for s in EstimateRequestFile.FileType.choices}
        assert actual == expected

    def test_default_parse_status(self, db):
        """parse_status по умолчанию — PENDING."""
        f = EstimateRequestFileFactory()
        assert f.parse_status == EstimateRequestFile.ParseStatus.PENDING

    def test_default_file_type(self, db):
        """file_type по умолчанию — OTHER."""
        f = EstimateRequestFileFactory(file_type=EstimateRequestFile.FileType.OTHER)
        assert f.file_type == EstimateRequestFile.FileType.OTHER

    def test_str(self, db):
        """__str__ возвращает имя файла."""
        f = EstimateRequestFileFactory(original_filename='specification.pdf')
        assert str(f) == 'specification.pdf'

    def test_ordering(self, db):
        """Файлы упорядочены по created_at (старые первыми)."""
        req = EstimateRequestFactory()
        f1 = EstimateRequestFileFactory(request=req, original_filename='a.pdf')
        f2 = EstimateRequestFileFactory(request=req, original_filename='b.pdf')
        qs = EstimateRequestFile.objects.filter(request=req)
        assert list(qs) == [f1, f2]


# =========================================================================
# EstimateRequestVersion
# =========================================================================

class TestEstimateRequestVersion:
    """Тесты модели EstimateRequestVersion."""

    def test_unique_together(self, db):
        """Нельзя создать две версии с одним номером для одного запроса."""
        req = EstimateRequestFactory()
        EstimateRequestVersionFactory(request=req, version_number=1)
        with pytest.raises(IntegrityError):
            EstimateRequestVersionFactory(request=req, version_number=1)

    def test_ordering(self, db):
        """Версии упорядочены по -version_number (новые первыми)."""
        req = EstimateRequestFactory()
        v1 = EstimateRequestVersionFactory(request=req, version_number=1)
        v2 = EstimateRequestVersionFactory(request=req, version_number=2)
        qs = EstimateRequestVersion.objects.filter(request=req)
        assert list(qs) == [v2, v1]

    def test_str(self, db):
        """__str__ содержит номер версии."""
        v = EstimateRequestVersionFactory(version_number=3)
        assert 'v3' in str(v)


# =========================================================================
# PublicPortalConfig
# =========================================================================

class TestPublicPortalConfig:
    """Тесты модели PublicPortalConfig (singleton)."""

    def test_singleton_pk_always_1(self, db):
        """save() всегда ставит pk=1."""
        config = PublicPortalConfig(
            auto_approve=True, operator_emails='test@test.com',
        )
        config.save()
        assert config.pk == 1

    def test_singleton_overwrite(self, db):
        """Повторный save() перезаписывает существующую запись."""
        config = PublicPortalConfig(auto_approve=False, operator_emails='a@a.com')
        config.save()
        # Обновляем существующий объект (не создаём новый без created_at)
        config.auto_approve = True
        config.operator_emails = 'b@b.com'
        config.save()
        assert PublicPortalConfig.objects.count() == 1
        config.refresh_from_db()
        assert config.auto_approve is True
        assert config.operator_emails == 'b@b.com'

    def test_get_creates_if_not_exists(self, db):
        """get() создаёт запись если её нет."""
        assert PublicPortalConfig.objects.count() == 0
        config = PublicPortalConfig.get()
        assert config.pk == 1
        assert config.auto_approve is False
        assert PublicPortalConfig.objects.count() == 1

    def test_get_returns_existing(self, db):
        """get() возвращает существующую запись."""
        PublicPortalConfig(
            auto_approve=True,
            operator_emails='custom@test.com',
            max_pages_per_request=50,
        ).save()
        config = PublicPortalConfig.get()
        assert config.auto_approve is True
        assert config.operator_emails == 'custom@test.com'
        assert config.max_pages_per_request == 50

    def test_operator_email_list(self, portal_config):
        """operator_email_list парсит строку через запятую."""
        assert portal_config.operator_email_list == [
            'op1@company.ru', 'op2@company.ru',
        ]

    def test_operator_email_list_empty(self, db):
        """operator_email_list возвращает пустой список для пустой строки."""
        config = PublicPortalConfig(operator_emails='')
        assert config.operator_email_list == []

    def test_operator_email_list_single(self, db):
        """operator_email_list для одного email (без запятой)."""
        config = PublicPortalConfig(operator_emails='single@test.com')
        assert config.operator_email_list == ['single@test.com']

    def test_operator_email_list_whitespace(self, db):
        """operator_email_list игнорирует пробелы и пустые элементы."""
        config = PublicPortalConfig(operator_emails=' a@a.com ,  , b@b.com , ')
        assert config.operator_email_list == ['a@a.com', 'b@b.com']

    def test_default_values(self, db):
        """Дефолтные значения полей."""
        config = PublicPortalConfig.get()
        assert config.max_pages_per_request == 100
        assert config.max_files_per_request == 20
        assert config.link_expiry_days == 30


# =========================================================================
# PublicPricingConfig
# =========================================================================

class TestPublicPricingConfig:
    """Тесты модели PublicPricingConfig."""

    def test_get_markup_default_fallback(self, db):
        """get_markup без конфигов возвращает 30% (хардкод)."""
        assert PublicPricingConfig.get_markup() == Decimal('30.00')

    def test_get_markup_default_config(self, default_pricing):
        """get_markup возвращает значение из default config."""
        assert PublicPricingConfig.get_markup() == Decimal('25.00')

    def test_get_markup_category(self, db, default_pricing):
        """get_markup для конкретной категории."""
        from catalog.models import Category
        cat = Category.objects.create(name='Вентиляция', code='vent')
        PublicPricingConfigFactory(category=cat, markup_percent='15.00')
        assert PublicPricingConfig.get_markup(cat) == Decimal('15.00')

    def test_get_markup_parent_cascade(self, db, default_pricing):
        """get_markup каскадирует к родительской категории."""
        from catalog.models import Category
        parent = Category.objects.create(name='HVAC', code='hvac')
        child = Category.objects.create(name='Кондиционеры', code='hvac_ac', parent=parent)
        PublicPricingConfigFactory(category=parent, markup_percent='20.00')
        # У child нет своего конфига — каскад к parent
        assert PublicPricingConfig.get_markup(child) == Decimal('20.00')

    def test_get_markup_category_no_config_uses_default(self, db, default_pricing):
        """Категория без конфига и без родителя → default."""
        from catalog.models import Category
        cat = Category.objects.create(name='Прочее', code='other')
        assert PublicPricingConfig.get_markup(cat) == Decimal('25.00')

    def test_unique_category_constraint(self, db):
        """Нельзя создать два конфига для одной категории."""
        from catalog.models import Category
        cat = Category.objects.create(name='Трубы', code='pipes')
        PublicPricingConfigFactory(category=cat)
        with pytest.raises(IntegrityError):
            PublicPricingConfigFactory(category=cat)

    def test_str_with_category(self, db):
        """__str__ для конфига с категорией."""
        from catalog.models import Category
        cat = Category.objects.create(name='Насосы', code='pumps')
        config = PublicPricingConfigFactory(
            category=cat, markup_percent='40.00',
        )
        s = str(config)
        assert 'Насосы' in s
        assert '40.00' in s

    def test_str_default(self, db):
        """__str__ для default конфига."""
        config = PublicPricingConfigFactory(is_default=True, markup_percent='30.00')
        s = str(config)
        assert 'По умолчанию' in s


# =========================================================================
# CallbackRequest
# =========================================================================

class TestCallbackRequest:
    """Тесты модели CallbackRequest."""

    def test_all_statuses_valid(self):
        """Все статусы из TextChoices корректны."""
        expected = {'new', 'in_progress', 'completed', 'cancelled'}
        actual = {s[0] for s in CallbackRequest.Status.choices}
        assert actual == expected

    def test_default_status(self, db):
        """Статус по умолчанию — NEW."""
        cb = CallbackRequestFactory()
        assert cb.status == CallbackRequest.Status.NEW

    def test_cascade_on_request_delete(self, db):
        """При удалении запроса удаляется заявка на звонок."""
        cb = CallbackRequestFactory()
        request_id = cb.request_id
        EstimateRequest.objects.filter(pk=request_id).delete()
        assert CallbackRequest.objects.count() == 0

    def test_str(self, db):
        """__str__ содержит телефон."""
        cb = CallbackRequestFactory(phone='+79001234567')
        assert '+79001234567' in str(cb)

    def test_ordering(self, db):
        """Заявки упорядочены по -created_at."""
        cb1 = CallbackRequestFactory()
        cb2 = CallbackRequestFactory()
        qs = CallbackRequest.objects.all()
        assert list(qs) == [cb2, cb1]
