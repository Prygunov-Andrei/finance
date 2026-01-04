from django.db import models
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.db.models import Sum
from decimal import Decimal
from functools import cached_property

from core.models import TimestampedModel
from core.cached import CachedPropertyMixin
from objects.models import Object
from accounting.models import LegalEntity, Counterparty
from pricelists.models import PriceList


def project_file_path(instance, filename):
    """Путь для файлов проекта"""
    return f'projects/{instance.object.id}/{instance.cipher}/{filename}'


def project_approval_path(instance, filename):
    """Путь для файлов разрешений проекта"""
    return f'projects/{instance.object.id}/{instance.cipher}/approvals/{filename}'


def estimate_file_path(instance, filename):
    """Путь для файлов сметы"""
    return f'estimates/{instance.object.id}/{instance.number}/{filename}'


def mounting_estimate_file_path(instance, filename):
    """Путь для файлов монтажной сметы"""
    return f'mounting_estimates/{instance.object.id}/{instance.number}/{filename}'


class Project(TimestampedModel):
    """Проектная документация"""
    
    class Stage(models.TextChoices):
        P = 'П', 'Проектная документация'
        RD = 'РД', 'Рабочая документация'
    
    cipher = models.CharField(
        max_length=100,
        verbose_name='Шифр проекта'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название проекта'
    )
    date = models.DateField(
        verbose_name='Дата проекта'
    )
    stage = models.CharField(
        max_length=10,
        choices=Stage.choices,
        verbose_name='Стадия'
    )
    object = models.ForeignKey(
        Object,
        on_delete=models.CASCADE,
        related_name='projects',
        verbose_name='Объект строительства'
    )
    file = models.FileField(
        upload_to=project_file_path,
        verbose_name='ZIP-архив проекта'
    )
    notes = models.TextField(
        blank=True,
        verbose_name='Общие примечания'
    )
    is_approved_for_production = models.BooleanField(
        default=False,
        verbose_name='Разрешение "В производство работ"'
    )
    production_approval_file = models.FileField(
        upload_to=project_approval_path,
        null=True,
        blank=True,
        verbose_name='Скан разрешения'
    )
    production_approval_date = models.DateField(
        null=True,
        blank=True,
        verbose_name='Дата получения разрешения'
    )
    primary_check_done = models.BooleanField(
        default=False,
        verbose_name='Первичная проверка выполнена'
    )
    primary_check_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='primary_checked_projects',
        verbose_name='Кто проверил (первичная)'
    )
    primary_check_date = models.DateField(
        null=True,
        blank=True,
        verbose_name='Дата первичной проверки'
    )
    secondary_check_done = models.BooleanField(
        default=False,
        verbose_name='Вторичная проверка выполнена'
    )
    secondary_check_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='secondary_checked_projects',
        verbose_name='Кто проверил (вторичная)'
    )
    secondary_check_date = models.DateField(
        null=True,
        blank=True,
        verbose_name='Дата вторичной проверки'
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
    is_current = models.BooleanField(
        default=True,
        verbose_name='Актуальная версия'
    )

    class Meta:
        unique_together = ('cipher', 'date')
        ordering = ['-date', '-created_at']
        verbose_name = 'Проект'
        verbose_name_plural = 'Проекты'

    def __str__(self):
        return f"{self.cipher} - {self.name}"

    def clean(self):
        """Валидация: при is_approved_for_production=True поле production_approval_file обязательно"""
        if self.is_approved_for_production and not self.production_approval_file:
            raise ValidationError({
                'production_approval_file': 'При разрешении "В производство работ" необходимо прикрепить файл разрешения'
            })

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def create_new_version(self) -> 'Project':
        """
        Создать новую версию проекта.
        1. Текущая версия: is_current = False
        2. Создать копию (без файлов!)
        3. Новая версия: parent_version = self, version_number++
        4. Поля для заполнения: cipher, date, file (пользователь заполняет сам)
        """
        # Помечаем текущую версию как неактуальную
        self.is_current = False
        self.save()
        
        # Создаём временный файл для новой версии (пользователь должен заменить)
        from django.core.files.uploadedfile import SimpleUploadedFile
        temp_file = SimpleUploadedFile('temp.zip', b'temporary file')
        
        # Изменяем дату, чтобы избежать конфликта unique_together
        from datetime import timedelta
        new_date = self.date + timedelta(days=1)
        
        # Создаём новую версию
        new_version = Project.objects.create(
            cipher=self.cipher,  # Пользователь может изменить
            name=self.name,
            date=new_date,  # Изменяем дату для уникальности
            stage=self.stage,
            object=self.object,
            file=temp_file,  # Временный файл
            notes=self.notes,
            is_approved_for_production=False,
            production_approval_file=None,
            production_approval_date=None,
            primary_check_done=False,
            primary_check_by=None,
            primary_check_date=None,
            secondary_check_done=False,
            secondary_check_by=None,
            secondary_check_date=None,
            parent_version=self,
            version_number=self.version_number + 1,
            is_current=True
        )
        
        return new_version

    @classmethod
    def get_current_projects(cls):
        """Получить только актуальные версии проектов"""
        return cls.objects.filter(is_current=True)


class ProjectNote(TimestampedModel):
    """Замечание к проекту"""
    
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='project_notes',
        verbose_name='Проект'
    )
    author = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='project_notes',
        verbose_name='Автор замечания'
    )
    text = models.TextField(
        verbose_name='Текст замечания'
    )

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Замечание к проекту'
        verbose_name_plural = 'Замечания к проектам'

    def __str__(self):
        return f"Замечание к {self.project.cipher} от {self.author.username}"


def generate_estimate_number() -> str:
    """
    Генерация номера сметы.
    Формат: СМ-{год}-{порядковый_номер}
    Пример: СМ-2025-001, СМ-2025-002
    """
    from core.number_generator import generate_sequential_number
    return generate_sequential_number(Estimate, prefix='СМ', digits=3)


class Estimate(CachedPropertyMixin, TimestampedModel):
    """Смета на работы и материалы для Заказчика"""
    
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        IN_PROGRESS = 'in_progress', 'В работе'
        CHECKING = 'checking', 'На проверке'
        APPROVED = 'approved', 'Утверждена'
        SENT = 'sent', 'Отправлена Заказчику'
        AGREED = 'agreed', 'Согласована Заказчиком'
        REJECTED = 'rejected', 'Отклонена'
    
    number = models.CharField(
        max_length=50,
        unique=True,
        verbose_name='Номер сметы'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название сметы'
    )
    object = models.ForeignKey(
        Object,
        on_delete=models.CASCADE,
        related_name='estimates',
        verbose_name='Объект'
    )
    legal_entity = models.ForeignKey(
        LegalEntity,
        on_delete=models.PROTECT,
        related_name='estimates',
        verbose_name='Наша компания'
    )
    with_vat = models.BooleanField(
        default=True,
        verbose_name='С НДС'
    )
    vat_rate = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=20.00,
        verbose_name='Ставка НДС, %'
    )
    projects = models.ManyToManyField(
        Project,
        related_name='estimates',
        blank=True,
        verbose_name='Проекты-основания'
    )
    price_list = models.ForeignKey(
        PriceList,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='estimates',
        verbose_name='Прайс-лист для расчёта'
    )
    man_hours = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        verbose_name='Человеко-часы'
    )
    usd_rate = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        verbose_name='Курс USD'
    )
    eur_rate = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        verbose_name='Курс EUR'
    )
    cny_rate = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        verbose_name='Курс CNY'
    )
    file = models.FileField(
        upload_to=estimate_file_path,
        null=True,
        blank=True,
        verbose_name='Excel-файл сметы'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name='Статус'
    )
    approved_by_customer = models.BooleanField(
        default=False,
        verbose_name='Согласовано Заказчиком'
    )
    approved_date = models.DateField(
        null=True,
        blank=True,
        verbose_name='Дата согласования'
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='created_estimates',
        verbose_name='Кто составил'
    )
    checked_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='checked_estimates',
        verbose_name='Кто проверил'
    )
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_estimates',
        verbose_name='Кто утвердил'
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
        ordering = ['-created_at']
        verbose_name = 'Смета'
        verbose_name_plural = 'Сметы'

    def __str__(self):
        return f"{self.number} - {self.name}"

    def save(self, *args, **kwargs):
        if not self.number:
            self.number = generate_estimate_number()
        super().save(*args, **kwargs)

    @cached_property
    def total_materials_sale(self) -> Decimal:
        """Сумма материалов (продажа) из всех подразделов (кэшируется)"""
        return self.sections.aggregate(
            total=Sum('subsections__materials_sale')
        )['total'] or Decimal('0')

    @cached_property
    def total_works_sale(self) -> Decimal:
        """Сумма работ (продажа) из всех подразделов (кэшируется)"""
        return self.sections.aggregate(
            total=Sum('subsections__works_sale')
        )['total'] or Decimal('0')

    @cached_property
    def total_materials_purchase(self) -> Decimal:
        """Сумма материалов (закупка) из всех подразделов (кэшируется)"""
        return self.sections.aggregate(
            total=Sum('subsections__materials_purchase')
        )['total'] or Decimal('0')

    @cached_property
    def total_works_purchase(self) -> Decimal:
        """Сумма работ (закупка) из всех подразделов (кэшируется)"""
        return self.sections.aggregate(
            total=Sum('subsections__works_purchase')
        )['total'] or Decimal('0')

    @cached_property
    def total_sale(self) -> Decimal:
        """Общая сумма продажи (кэшируется)"""
        return self.total_materials_sale + self.total_works_sale

    @cached_property
    def total_purchase(self) -> Decimal:
        """Общая сумма закупки (кэшируется)"""
        return self.total_materials_purchase + self.total_works_purchase

    @cached_property
    def vat_amount(self) -> Decimal:
        """Сумма НДС (кэшируется)"""
        if not self.with_vat:
            return Decimal('0')
        return (self.total_sale * self.vat_rate / Decimal('100')).quantize(Decimal('0.01'))

    @cached_property
    def total_with_vat(self) -> Decimal:
        """Итого с НДС (кэшируется)"""
        return self.total_sale + self.vat_amount

    @cached_property
    def profit_amount(self) -> Decimal:
        """Прибыль в рублях (кэшируется)"""
        return self.total_sale - self.total_purchase

    @cached_property
    def profit_percent(self) -> Decimal:
        """Прибыль в процентах (кэшируется)"""
        if self.total_sale == 0:
            return Decimal('0')
        return ((self.profit_amount / self.total_sale) * 100).quantize(Decimal('0.01'))

    def create_new_version(self) -> 'Estimate':
        """
        Создать новую версию сметы.
        1. Копирует все поля (кроме файла, статуса, согласований)
        2. Копирует все разделы, подразделы и характеристики
        3. Новая версия: parent_version = self, version_number++, status = draft
        """
        # Создаём новую версию сметы
        new_estimate = Estimate.objects.create(
            number=generate_estimate_number(),  # Новый номер
            name=self.name,
            object=self.object,
            legal_entity=self.legal_entity,
            with_vat=self.with_vat,
            vat_rate=self.vat_rate,
            price_list=self.price_list,
            man_hours=self.man_hours,
            usd_rate=self.usd_rate,
            eur_rate=self.eur_rate,
            cny_rate=self.cny_rate,
            status=Estimate.Status.DRAFT,
            approved_by_customer=False,
            approved_date=None,
            created_by=self.created_by,
            checked_by=None,
            approved_by=None,
            parent_version=self,
            version_number=self.version_number + 1
        )
        
        # Копируем проекты-основания
        new_estimate.projects.set(self.projects.all())
        
        # Копируем разделы и подразделы
        for section in self.sections.all():
            new_section = EstimateSection.objects.create(
                estimate=new_estimate,
                name=section.name,
                sort_order=section.sort_order
            )
            for subsection in section.subsections.all():
                EstimateSubsection.objects.create(
                    section=new_section,
                    name=subsection.name,
                    materials_sale=subsection.materials_sale,
                    works_sale=subsection.works_sale,
                    materials_purchase=subsection.materials_purchase,
                    works_purchase=subsection.works_purchase,
                    sort_order=subsection.sort_order
                )
        
        # Копируем характеристики
        for char in self.characteristics.all():
            EstimateCharacteristic.objects.create(
                estimate=new_estimate,
                name=char.name,
                purchase_amount=char.purchase_amount,
                sale_amount=char.sale_amount,
                is_auto_calculated=char.is_auto_calculated,
                source_type=char.source_type,
                sort_order=char.sort_order
            )
        
        return new_estimate

    def create_initial_characteristics(self):
        """
        Создать начальные характеристики (Материалы, Работы).
        Вызывается после создания сметы.
        """
        EstimateCharacteristic.objects.create(
            estimate=self,
            name='Материалы',
            purchase_amount=Decimal('0'),
            sale_amount=Decimal('0'),
            is_auto_calculated=True,
            source_type=EstimateCharacteristic.SourceType.SECTIONS,
            sort_order=1
        )
        EstimateCharacteristic.objects.create(
            estimate=self,
            name='Работы',
            purchase_amount=Decimal('0'),
            sale_amount=Decimal('0'),
            is_auto_calculated=True,
            source_type=EstimateCharacteristic.SourceType.SECTIONS,
            sort_order=2
        )

    def update_auto_characteristics(self):
        """
        Обновить автоматически рассчитываемые характеристики.
        Вызывается при изменении разделов/подразделов.
        """
        for char in self.characteristics.filter(
            is_auto_calculated=True,
            source_type=EstimateCharacteristic.SourceType.SECTIONS
        ):
            if char.name == 'Материалы':
                char.sale_amount = self.total_materials_sale
                char.purchase_amount = self.total_materials_purchase
            elif char.name == 'Работы':
                char.sale_amount = self.total_works_sale
                char.purchase_amount = self.total_works_purchase
            char.save()


class EstimateSection(CachedPropertyMixin, TimestampedModel):
    """Раздел сметы (первый уровень иерархии)"""
    
    estimate = models.ForeignKey(
        Estimate,
        on_delete=models.CASCADE,
        related_name='sections',
        verbose_name='Смета'
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
        verbose_name = 'Раздел сметы'
        verbose_name_plural = 'Разделы сметы'

    def __str__(self):
        return f"{self.estimate.number} - {self.name}"

    @cached_property
    def total_materials_sale(self) -> Decimal:
        return self.subsections.aggregate(total=Sum('materials_sale'))['total'] or Decimal('0')

    @cached_property
    def total_works_sale(self) -> Decimal:
        return self.subsections.aggregate(total=Sum('works_sale'))['total'] or Decimal('0')

    @cached_property
    def total_materials_purchase(self) -> Decimal:
        return self.subsections.aggregate(total=Sum('materials_purchase'))['total'] or Decimal('0')

    @cached_property
    def total_works_purchase(self) -> Decimal:
        return self.subsections.aggregate(total=Sum('works_purchase'))['total'] or Decimal('0')

    @cached_property
    def total_sale(self) -> Decimal:
        return self.total_materials_sale + self.total_works_sale

    @cached_property
    def total_purchase(self) -> Decimal:
        return self.total_materials_purchase + self.total_works_purchase


class EstimateSubsection(TimestampedModel):
    """Подраздел сметы (второй уровень иерархии) с суммами"""
    
    section = models.ForeignKey(
        EstimateSection,
        on_delete=models.CASCADE,
        related_name='subsections',
        verbose_name='Раздел'
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
        verbose_name = 'Подраздел сметы'
        verbose_name_plural = 'Подразделы сметы'

    def __str__(self):
        return f"{self.section.name} - {self.name}"

    @property
    def total_sale(self) -> Decimal:
        return self.materials_sale + self.works_sale

    @property
    def total_purchase(self) -> Decimal:
        return self.materials_purchase + self.works_purchase


@receiver(post_save, sender=EstimateSubsection)
@receiver(post_delete, sender=EstimateSubsection)
def update_estimate_characteristics(sender, instance, **kwargs):
    """При изменении подраздела обновить автоматические характеристики сметы"""
    estimate = instance.section.estimate
    estimate.update_auto_characteristics()


class EstimateCharacteristic(TimestampedModel):
    """Внутренняя характеристика сметы"""
    
    class SourceType(models.TextChoices):
        SECTIONS = 'sections', 'Из разделов сметы'
        MANUAL = 'manual', 'Введено вручную'
    
    estimate = models.ForeignKey(
        Estimate,
        on_delete=models.CASCADE,
        related_name='characteristics',
        verbose_name='Смета'
    )
    name = models.CharField(
        max_length=100,
        verbose_name='Название'
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
    is_auto_calculated = models.BooleanField(
        default=False,
        verbose_name='Автоматически рассчитано'
    )
    source_type = models.CharField(
        max_length=20,
        choices=SourceType.choices,
        default=SourceType.MANUAL,
        verbose_name='Источник данных'
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок сортировки'
    )

    class Meta:
        ordering = ['sort_order', 'id']
        verbose_name = 'Характеристика сметы'
        verbose_name_plural = 'Характеристики сметы'

    def __str__(self):
        return f"{self.estimate.number} - {self.name}"


def generate_mounting_estimate_number() -> str:
    """
    Генерация номера монтажной сметы.
    Формат: МС-{год}-{порядковый_номер}
    Пример: МС-2025-001
    """
    from core.number_generator import generate_sequential_number
    return generate_sequential_number(MountingEstimate, prefix='МС', digits=3)


class MountingEstimate(TimestampedModel):
    """Монтажная смета (упрощённая смета для Исполнителя)"""
    
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        SENT = 'sent', 'Отправлена'
        APPROVED = 'approved', 'Согласована'
        REJECTED = 'rejected', 'Отклонена'
    
    number = models.CharField(
        max_length=50,
        unique=True,
        verbose_name='Номер'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Название'
    )
    object = models.ForeignKey(
        Object,
        on_delete=models.CASCADE,
        related_name='mounting_estimates',
        verbose_name='Объект'
    )
    source_estimate = models.ForeignKey(
        Estimate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='mounting_estimates',
        verbose_name='Исходная смета'
    )
    total_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Итоговая сумма (без НДС)'
    )
    man_hours = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        verbose_name='Человеко-часы'
    )
    file = models.FileField(
        upload_to=mounting_estimate_file_path,
        null=True,
        blank=True,
        verbose_name='Excel-файл'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name='Статус'
    )
    agreed_counterparty = models.ForeignKey(
        Counterparty,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='agreed_mounting_estimates',
        verbose_name='Согласовано с Исполнителем'
    )
    agreed_date = models.DateField(
        null=True,
        blank=True,
        verbose_name='Дата согласования'
    )
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='created_mounting_estimates',
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

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Монтажная смета'
        verbose_name_plural = 'Монтажные сметы'

    def __str__(self):
        return f"{self.number} - {self.name}"

    def clean(self):
        """Валидация: agreed_counterparty.type должен быть 'vendor' или 'both'"""
        if self.agreed_counterparty:
            if self.agreed_counterparty.type not in [Counterparty.Type.VENDOR, Counterparty.Type.BOTH]:
                raise ValidationError({
                    'agreed_counterparty': 'Контрагент должен быть типа "Исполнитель/Поставщик" или "Заказчик и Исполнитель"'
                })

    def save(self, *args, **kwargs):
        if not self.number:
            self.number = generate_mounting_estimate_number()
        self.full_clean()
        super().save(*args, **kwargs)

    @classmethod
    def create_from_estimate(cls, estimate: Estimate, created_by: User) -> 'MountingEstimate':
        """
        Создать монтажную смету из обычной сметы.
        Копирует только total_works_purchase (работы — закупка).
        """
        return cls.objects.create(
            name=f'Монтажная смета к {estimate.name}',
            object=estimate.object,
            source_estimate=estimate,
            total_amount=estimate.total_works_purchase,
            man_hours=estimate.man_hours,
            created_by=created_by
        )

    def create_new_version(self) -> 'MountingEstimate':
        """Создать новую версию монтажной сметы"""
        new_version = MountingEstimate.objects.create(
            number=generate_mounting_estimate_number(),  # Новый номер
            name=self.name,
            object=self.object,
            source_estimate=self.source_estimate,
            total_amount=self.total_amount,
            man_hours=self.man_hours,
            status=MountingEstimate.Status.DRAFT,
            agreed_counterparty=None,
            agreed_date=None,
            created_by=self.created_by,
            parent_version=self,
            version_number=self.version_number + 1
        )
        return new_version
