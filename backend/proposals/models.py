from decimal import Decimal
from datetime import date as date_type, timedelta
from typing import Optional, Dict
from functools import cached_property
from django.db import models
from django.core.exceptions import ValidationError
from django.conf import settings
from django.db.models import Sum
from django.contrib.auth.models import User
from core.models import TimestampedModel
from core.cached import CachedPropertyMixin


def tkp_file_path(instance, filename):
    """Путь для файлов ТКП"""
    return f'proposals/tkp/{instance.object.id}/{instance.number}/{filename}'


def mp_file_path(instance, filename):
    """Путь для файлов МП"""
    return f'proposals/mp/{instance.object.id}/{instance.number}/{filename}'


# Функции генерации номеров вынесены в core/number_generator.py
# Оставляем импорты для обратной совместимости
from core.number_generator import generate_tkp_number, generate_mp_number


class FrontOfWorkItem(TimestampedModel):
    """Справочник "Фронт работ" — что должен сделать Заказчик для выполнения работ"""
    
    name = models.CharField(
        max_length=500,
        verbose_name='Описание работы',
        help_text='Например: "Подвести электропитание к местам установки вентиляционного оборудования"'
    )
    category = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Категория',
        help_text='Например: "Электрика", "Строительство"'
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активна'
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок сортировки'
    )

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name = 'Пункт фронта работ'
        verbose_name_plural = 'Справочник фронта работ'

    def __str__(self):
        return self.name


class MountingCondition(TimestampedModel):
    """Справочник "Условия для МП" — что мы предоставляем Исполнителю"""
    
    name = models.CharField(
        max_length=200,
        verbose_name='Название',
        help_text='Например: "Проживание", "Инструмент", "Питание"'
    )
    description = models.TextField(
        blank=True,
        verbose_name='Подробное описание'
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активна'
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок сортировки'
    )

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name = 'Условие для МП'
        verbose_name_plural = 'Справочник условий для МП'

    def __str__(self):
        return self.name


class TechnicalProposal(CachedPropertyMixin, TimestampedModel):
    """Техническое коммерческое предложение для Заказчика"""
    
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        IN_PROGRESS = 'in_progress', 'В работе'
        CHECKING = 'checking', 'На проверке'
        APPROVED = 'approved', 'Утверждено'
        SENT = 'sent', 'Отправлено Заказчику'
        AGREED = 'agreed', 'Согласовано Заказчиком'
        REJECTED = 'rejected', 'Отклонено'
    
    number = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Номер ТКП',
        help_text='Автоматически генерируется, если не указан'
    )
    outgoing_number = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Исходящий номер',
        help_text='Ручной ввод'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название ТКП'
    )
    date = models.DateField(
        verbose_name='Дата ТКП'
    )
    object = models.ForeignKey(
        'objects.Object',
        on_delete=models.CASCADE,
        related_name='technical_proposals',
        verbose_name='Объект'
    )
    object_area = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='Площадь объекта, м²'
    )
    legal_entity = models.ForeignKey(
        'accounting.LegalEntity',
        on_delete=models.PROTECT,
        related_name='technical_proposals',
        verbose_name='Наша компания'
    )
    estimates = models.ManyToManyField(
        'estimates.Estimate',
        related_name='technical_proposals',
        blank=True,
        verbose_name='Привязанные сметы'
    )
    advance_required = models.TextField(
        blank=True,
        verbose_name='Необходимый аванс',
        help_text='Текст с описанием аванса'
    )
    work_duration = models.TextField(
        blank=True,
        verbose_name='Срок проведения работ',
        help_text='Текст с описанием срока'
    )
    validity_days = models.PositiveIntegerField(
        default=30,
        verbose_name='Срок действия предложения (дни)'
    )
    notes = models.TextField(
        blank=True,
        verbose_name='Примечания'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name='Статус'
    )
    file = models.FileField(
        upload_to=tkp_file_path,
        null=True,
        blank=True,
        verbose_name='Файл ТКП'
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='created_tkps',
        verbose_name='Кто создал'
    )
    checked_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='checked_tkps',
        verbose_name='Кто проверил'
    )
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_tkps',
        verbose_name='Кто утвердил'
    )
    approved_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Дата утверждения'
    )
    parent_version = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='child_versions',
        verbose_name='Предыдущая версия'
    )
    version_number = models.PositiveIntegerField(
        default=1,
        verbose_name='Номер версии'
    )

    class Meta:
        ordering = ['-date', '-created_at']
        verbose_name = 'ТКП'
        verbose_name_plural = 'ТКП'
        indexes = [
            models.Index(fields=['date']),
            models.Index(fields=['status', 'date']),
            models.Index(fields=['object', 'status']),
            models.Index(fields=['legal_entity', 'status']),
        ]

    def __str__(self):
        return f"ТКП №{self.number} - {self.name}"

    def save(self, *args, **kwargs):
        if not self.number:
            self.number = generate_tkp_number(self.date)
        super().save(*args, **kwargs)

    @property
    def signatory(self):
        """Подписант — директор компании"""
        return self.legal_entity.director if self.legal_entity else None

    @property
    def signatory_name(self) -> str:
        """ФИО подписанта для документов"""
        return self.legal_entity.director_name if self.legal_entity else ''

    @property
    def signatory_position(self) -> str:
        """Должность подписанта"""
        return self.legal_entity.director_position if self.legal_entity else ''

    @property
    def object_address(self) -> str:
        """Адрес объекта"""
        return self.object.address if self.object else ''

    @property
    def validity_date(self) -> date_type:
        """Дата окончания действия предложения"""
        return self.date + timedelta(days=self.validity_days)

    @cached_property
    def total_man_hours(self) -> Decimal:
        """Сумма человеко-часов из всех смет (кэшируется)"""
        return self.estimates.aggregate(
            total=Sum('man_hours')
        )['total'] or Decimal('0')

    @cached_property
    def total_amount(self) -> Decimal:
        """Общая сумма из TKPEstimateSubsection (кэшируется)"""
        total = self.estimate_sections.aggregate(
            materials=Sum('subsections__materials_sale'),
            works=Sum('subsections__works_sale')
        )
        return (total['materials'] or Decimal('0')) + (total['works'] or Decimal('0'))

    @property
    def total_with_vat(self) -> Decimal:
        """Общая сумма с НДС (берём из первой сметы)"""
        first_estimate = self.estimates.first()
        if first_estimate and first_estimate.with_vat:
            return self.total_amount * (1 + first_estimate.vat_rate / 100)
        return self.total_amount

    @cached_property
    def total_profit(self) -> Decimal:
        """Общая прибыль из характеристик (кэшируется)"""
        chars = self.characteristics.aggregate(
            sale=Sum('sale_amount'),
            purchase=Sum('purchase_amount')
        )
        return (chars['sale'] or Decimal('0')) - (chars['purchase'] or Decimal('0'))

    @cached_property
    def profit_percent(self) -> Decimal:
        """Процент прибыли (кэшируется)"""
        total_sale = self.characteristics.aggregate(total=Sum('sale_amount'))['total'] or Decimal('0')
        if total_sale == 0:
            return Decimal('0')
        return (self.total_profit / total_sale * 100).quantize(Decimal('0.01'))

    @cached_property
    def currency_rates(self) -> Dict[str, Optional[Decimal]]:
        """Курсы валют из всех смет (кэшируется)"""
        rates: Dict[str, Optional[Decimal]] = {'usd': None, 'eur': None, 'cny': None}
        for estimate in self.estimates.all():
            if estimate.usd_rate:
                rates['usd'] = estimate.usd_rate
            if estimate.eur_rate:
                rates['eur'] = estimate.eur_rate
            if estimate.cny_rate:
                rates['cny'] = estimate.cny_rate
        return rates

    @cached_property
    def projects(self):
        """Проекты из всех привязанных смет (кэшируется)"""
        from estimates.models import Project
        project_ids = self.estimates.values_list('projects', flat=True)
        return list(Project.objects.filter(id__in=project_ids).distinct())

    def copy_data_from_estimates(self):
        """
        Копировать данные из привязанных смет.
        Вызывается после добавления смет.
        Создаёт TKPEstimateSection, TKPEstimateSubsection, TKPCharacteristic.
        """
        # Очистить существующие данные
        self.estimate_sections.all().delete()
        self.characteristics.all().delete()
        
        section_order = 0
        char_order = 0
        
        # Собираем все данные для bulk_create
        sections_to_create = []
        subsections_data = []  # [(section_index, subsection_data), ...]
        characteristics_to_create = []
        
        estimates = list(self.estimates.all().prefetch_related(
            'sections__subsections', 'characteristics'
        ))
        
        for estimate in estimates:
            # Собираем разделы
            for section in estimate.sections.all():
                sections_to_create.append(
                    TKPEstimateSection(
                        tkp=self,
                        source_estimate=estimate,
                        source_section=section,
                        name=section.name,
                        sort_order=section_order
                    )
                )
                section_index = len(sections_to_create) - 1
                section_order += 1
                
                # Собираем подразделы для этого раздела
                for subsection in section.subsections.all():
                    subsections_data.append((section_index, subsection))
            
            # Собираем характеристики
            for char in estimate.characteristics.all():
                characteristics_to_create.append(
                    TKPCharacteristic(
                        tkp=self,
                        source_estimate=estimate,
                        source_characteristic=char,
                        name=f"{char.name} ({estimate.name})",
                        purchase_amount=char.purchase_amount,
                        sale_amount=char.sale_amount,
                        sort_order=char_order
                    )
                )
                char_order += 1
        
        # Создаём разделы через bulk_create
        if sections_to_create:
            TKPEstimateSection.objects.bulk_create(sections_to_create)
        
        # Создаём подразделы через bulk_create
        subsections_to_create = [
            TKPEstimateSubsection(
                section=sections_to_create[section_idx],
                source_subsection=subsection,
                name=subsection.name,
                materials_sale=subsection.materials_sale,
                works_sale=subsection.works_sale,
                materials_purchase=subsection.materials_purchase,
                works_purchase=subsection.works_purchase,
                sort_order=subsection.sort_order
            )
            for section_idx, subsection in subsections_data
        ]
        if subsections_to_create:
            TKPEstimateSubsection.objects.bulk_create(subsections_to_create)
        
        # Создаём характеристики через bulk_create
        if characteristics_to_create:
            TKPCharacteristic.objects.bulk_create(characteristics_to_create)

    def create_new_version(self) -> 'TechnicalProposal':
        """
        Создать новую версию ТКП.
        1. Копирует все поля (кроме статуса, согласований, файла)
        2. Копирует все разделы, подразделы, характеристики, фронт работ
        3. Новая версия: parent_version = self, version_number++, status = draft
        """
        from datetime import date as date_today
        
        new_tkp = TechnicalProposal.objects.create(
            name=self.name,
            date=date_today.today(),
            object=self.object,
            object_area=self.object_area,
            legal_entity=self.legal_entity,
            advance_required=self.advance_required,
            work_duration=self.work_duration,
            validity_days=self.validity_days,
            notes=self.notes,
            status=self.Status.DRAFT,
            created_by=self.created_by,
            parent_version=self,
            version_number=self.version_number + 1
        )
        
        # Копировать сметы
        new_tkp.estimates.set(self.estimates.all())
        
        # Копировать разделы через bulk_create
        old_sections = list(self.estimate_sections.all().prefetch_related('subsections'))
        new_sections = [
            TKPEstimateSection(
                tkp=new_tkp,
                source_estimate=section.source_estimate,
                source_section=section.source_section,
                name=section.name,
                sort_order=section.sort_order
            )
            for section in old_sections
        ]
        if new_sections:
            TKPEstimateSection.objects.bulk_create(new_sections)
        
        # Копировать подразделы через bulk_create
        new_subsections = []
        for old_section, new_section in zip(old_sections, new_sections):
            for subsection in old_section.subsections.all():
                new_subsections.append(
                    TKPEstimateSubsection(
                        section=new_section,
                        source_subsection=subsection.source_subsection,
                        name=subsection.name,
                        materials_sale=subsection.materials_sale,
                        works_sale=subsection.works_sale,
                        materials_purchase=subsection.materials_purchase,
                        works_purchase=subsection.works_purchase,
                        sort_order=subsection.sort_order
                    )
                )
        if new_subsections:
            TKPEstimateSubsection.objects.bulk_create(new_subsections)
        
        # Копировать характеристики через bulk_create
        new_characteristics = [
            TKPCharacteristic(
                tkp=new_tkp,
                source_estimate=char.source_estimate,
                source_characteristic=char.source_characteristic,
                name=char.name,
                purchase_amount=char.purchase_amount,
                sale_amount=char.sale_amount,
                sort_order=char.sort_order
            )
            for char in self.characteristics.all()
        ]
        if new_characteristics:
            TKPCharacteristic.objects.bulk_create(new_characteristics)
        
        # Копировать фронт работ через bulk_create
        new_front_of_work = [
            TKPFrontOfWork(
                tkp=new_tkp,
                front_item=front.front_item,
                when_text=front.when_text,
                when_date=front.when_date,
                sort_order=front.sort_order
            )
            for front in self.front_of_work.all()
        ]
        if new_front_of_work:
            TKPFrontOfWork.objects.bulk_create(new_front_of_work)
        
        return new_tkp


class TKPEstimateSection(CachedPropertyMixin, TimestampedModel):
    """Раздел сметы в ТКП (копия для редактирования)"""
    
    tkp = models.ForeignKey(
        TechnicalProposal,
        on_delete=models.CASCADE,
        related_name='estimate_sections',
        verbose_name='ТКП'
    )
    source_estimate = models.ForeignKey(
        'estimates.Estimate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tkp_sections',
        verbose_name='Исходная смета'
    )
    source_section = models.ForeignKey(
        'estimates.EstimateSection',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tkp_sections',
        verbose_name='Исходный раздел'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название раздела'
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок сортировки'
    )

    class Meta:
        ordering = ['sort_order', 'id']
        verbose_name = 'Раздел сметы в ТКП'
        verbose_name_plural = 'Разделы смет в ТКП'

    def __str__(self):
        return f"{self.tkp.number} - {self.name}"

    @cached_property
    def total_sale(self) -> Decimal:
        """Общая сумма продажи (кэшируется)"""
        total = self.subsections.aggregate(
            materials=Sum('materials_sale'),
            works=Sum('works_sale')
        )
        return (total['materials'] or Decimal('0')) + (total['works'] or Decimal('0'))

    @cached_property
    def total_purchase(self) -> Decimal:
        """Общая сумма закупки (кэшируется)"""
        total = self.subsections.aggregate(
            materials=Sum('materials_purchase'),
            works=Sum('works_purchase')
        )
        return (total['materials'] or Decimal('0')) + (total['works'] or Decimal('0'))


class TKPEstimateSubsection(TimestampedModel):
    """Подраздел сметы в ТКП (копия для редактирования)"""
    
    section = models.ForeignKey(
        TKPEstimateSection,
        on_delete=models.CASCADE,
        related_name='subsections',
        verbose_name='Раздел'
    )
    source_subsection = models.ForeignKey(
        'estimates.EstimateSubsection',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tkp_subsections',
        verbose_name='Исходный подраздел'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название подраздела'
    )
    materials_sale = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        verbose_name='Материалы — продажа'
    )
    works_sale = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        verbose_name='Работы — продажа'
    )
    materials_purchase = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        verbose_name='Материалы — закупка'
    )
    works_purchase = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        verbose_name='Работы — закупка'
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок сортировки'
    )

    class Meta:
        ordering = ['sort_order', 'id']
        verbose_name = 'Подраздел сметы в ТКП'
        verbose_name_plural = 'Подразделы смет в ТКП'

    def __str__(self):
        return f"{self.section.name} - {self.name}"

    @property
    def total_sale(self) -> Decimal:
        """Общая сумма продажи"""
        return self.materials_sale + self.works_sale

    @property
    def total_purchase(self) -> Decimal:
        """Общая сумма закупки"""
        return self.materials_purchase + self.works_purchase


class TKPCharacteristic(TimestampedModel):
    """Характеристика ТКП (копия внутренней характеристики сметы)"""
    
    tkp = models.ForeignKey(
        TechnicalProposal,
        on_delete=models.CASCADE,
        related_name='characteristics',
        verbose_name='ТКП'
    )
    source_estimate = models.ForeignKey(
        'estimates.Estimate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tkp_characteristics',
        verbose_name='Исходная смета'
    )
    source_characteristic = models.ForeignKey(
        'estimates.EstimateCharacteristic',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tkp_characteristics',
        verbose_name='Исходная характеристика'
    )
    name = models.CharField(
        max_length=200,
        verbose_name='Название',
        help_text='Например: "Материалы (Смета 1)", "Работы (Смета 1)"'
    )
    purchase_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        verbose_name='Сумма закупки'
    )
    sale_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        verbose_name='Сумма продажи'
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок сортировки'
    )

    class Meta:
        ordering = ['sort_order', 'id']
        verbose_name = 'Характеристика ТКП'
        verbose_name_plural = 'Характеристики ТКП'

    def __str__(self):
        return f"{self.tkp.number} - {self.name}"


class TKPFrontOfWork(TimestampedModel):
    """Фронт работ в ТКП"""
    
    tkp = models.ForeignKey(
        TechnicalProposal,
        on_delete=models.CASCADE,
        related_name='front_of_work',
        verbose_name='ТКП'
    )
    front_item = models.ForeignKey(
        FrontOfWorkItem,
        on_delete=models.PROTECT,
        related_name='tkp_usages',
        verbose_name='Пункт из справочника'
    )
    when_text = models.TextField(
        blank=True,
        verbose_name='Когда (текст)',
        help_text='Текстовое описание срока выполнения'
    )
    when_date = models.DateField(
        null=True,
        blank=True,
        verbose_name='Когда (дата)',
        help_text='Конкретная дата выполнения'
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок сортировки'
    )

    class Meta:
        ordering = ['sort_order', 'id']
        unique_together = ('tkp', 'front_item')
        verbose_name = 'Пункт фронта работ в ТКП'
        verbose_name_plural = 'Фронт работ в ТКП'

    def __str__(self):
        return f"{self.tkp.number} - {self.front_item.name}"


class MountingProposal(TimestampedModel):
    """Монтажное предложение для Исполнителя"""
    
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        PUBLISHED = 'published', 'Опубликовано'
        SENT = 'sent', 'Отправлено Исполнителю'
        APPROVED = 'approved', 'Согласовано'
        REJECTED = 'rejected', 'Отклонено'
    
    number = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Номер МП',
        help_text='Автоматически генерируется, если не указан'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название'
    )
    date = models.DateField(
        verbose_name='Дата МП'
    )
    object = models.ForeignKey(
        'objects.Object',
        on_delete=models.CASCADE,
        related_name='mounting_proposals',
        verbose_name='Объект'
    )
    counterparty = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='mounting_proposals',
        verbose_name='Исполнитель'
    )
    parent_tkp = models.ForeignKey(
        TechnicalProposal,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='mounting_proposals',
        verbose_name='Родительское ТКП'
    )
    mounting_estimate = models.ForeignKey(
        'estimates.MountingEstimate',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='mounting_proposals',
        verbose_name='Монтажная смета'
    )
    total_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
        verbose_name='Итоговая сумма'
    )
    man_hours = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        verbose_name='Человеко-часы'
    )
    notes = models.TextField(
        blank=True,
        verbose_name='Примечания'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name='Статус'
    )
    file = models.FileField(
        upload_to=mp_file_path,
        null=True,
        blank=True,
        verbose_name='Файл МП'
    )
    telegram_published = models.BooleanField(
        default=False,
        verbose_name='Опубликовано в Telegram'
    )
    telegram_published_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Дата публикации в Telegram'
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='created_mps',
        verbose_name='Кто создал'
    )
    parent_version = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='child_versions',
        verbose_name='Предыдущая версия'
    )
    version_number = models.PositiveIntegerField(
        default=1,
        verbose_name='Номер версии'
    )
    conditions = models.ManyToManyField(
        MountingCondition,
        related_name='mounting_proposals',
        blank=True,
        verbose_name='Условия'
    )

    class Meta:
        ordering = ['-date', '-created_at']
        verbose_name = 'МП'
        verbose_name_plural = 'МП'
        indexes = [
            models.Index(fields=['date']),
            models.Index(fields=['status', 'date']),
            models.Index(fields=['object', 'status']),
            models.Index(fields=['counterparty', 'status']),
        ]

    def __str__(self):
        return f"МП №{self.number} - {self.name}"

    def clean(self):
        """Валидация: если указан counterparty, его type должен быть 'vendor' или 'both'"""
        if self.counterparty:
            if self.counterparty.type not in ['vendor', 'both']:
                raise ValidationError({
                    'counterparty': 'Контрагент должен быть типа "Исполнитель/Поставщик" или "Заказчик и Исполнитель"'
                })

    def save(self, *args, **kwargs):
        self.full_clean()
        if not self.number:
            self.number = generate_mp_number(self.parent_tkp, self.date)
        super().save(*args, **kwargs)

    def copy_from_mounting_estimate(self):
        """Скопировать данные из монтажной сметы"""
        if self.mounting_estimate:
            self.total_amount = self.mounting_estimate.total_amount
            self.man_hours = self.mounting_estimate.man_hours

    @classmethod
    def create_from_tkp(cls, tkp: TechnicalProposal, created_by: User) -> 'MountingProposal':
        """Создать МП на основе ТКП"""
        from datetime import date as date_today
        return cls.objects.create(
            name=f'МП к {tkp.name}',
            date=date_today.today(),
            object=tkp.object,
            parent_tkp=tkp,
            created_by=created_by
        )

    def create_new_version(self) -> 'MountingProposal':
        """Создать новую версию МП"""
        from datetime import date as date_today
        new_mp = MountingProposal.objects.create(
            name=self.name,
            date=date_today.today(),
            object=self.object,
            counterparty=self.counterparty,
            parent_tkp=self.parent_tkp,
            mounting_estimate=self.mounting_estimate,
            total_amount=self.total_amount,
            man_hours=self.man_hours,
            notes=self.notes,
            status=self.Status.DRAFT,
            created_by=self.created_by,
            parent_version=self,
            version_number=self.version_number + 1
        )
        
        # Копировать условия
        new_mp.conditions.set(self.conditions.all())
        
        return new_mp
