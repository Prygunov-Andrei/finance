from django.db import models
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from decimal import Decimal
from core.models import TimestampedModel


class WorkerGrade(TimestampedModel):
    """Глобальный справочник разрядов монтажников с базовыми ставками"""
    
    grade = models.PositiveSmallIntegerField(
        unique=True,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        verbose_name='Номер разряда',
        help_text='Значение от 1 до 5'
    )
    name = models.CharField(
        max_length=100,
        verbose_name='Название',
        help_text='Например: Монтажник 1 разряда'
    )
    default_hourly_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name='Базовая ставка руб/час'
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активен'
    )

    class Meta:
        ordering = ['grade']
        verbose_name = 'Разряд рабочего'
        verbose_name_plural = 'Разряды рабочих'

    def __str__(self):
        return f"{self.name} ({self.default_hourly_rate} руб/ч)"

    def clean(self):
        if self.grade is not None and (self.grade < 1 or self.grade > 5):
            raise ValidationError({'grade': 'Разряд должен быть от 1 до 5'})


class WorkSection(TimestampedModel):
    """Справочник разделов/категорий работ с поддержкой иерархии"""
    
    code = models.CharField(
        max_length=50,
        unique=True,
        verbose_name='Код раздела',
        help_text='Например: VENT, COND'
    )
    name = models.CharField(
        max_length=200,
        verbose_name='Название',
        help_text='Например: Вентиляция, Кондиционирование'
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='children',
        verbose_name='Родительский раздел'
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='Активен'
    )
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name='Порядок сортировки'
    )

    class Meta:
        ordering = ['sort_order', 'name']
        verbose_name = 'Раздел работ'
        verbose_name_plural = 'Разделы работ'

    def __str__(self):
        return f"{self.code} - {self.name}"

    def clean(self):
        if self.parent:
            # Проверка на циклическую ссылку
            parent = self.parent
            visited = set()
            while parent:
                if parent.pk == self.pk:
                    raise ValidationError({
                        'parent': 'Нельзя создать циклическую ссылку (раздел не может быть потомком самого себя)'
                    })
                if parent.pk in visited:
                    break
                visited.add(parent.pk)
                parent = parent.parent

    def get_descendants(self):
        """Получить всех потомков раздела"""
        descendants = []
        for child in self.children.all():
            descendants.append(child)
            descendants.extend(child.get_descendants())
        return descendants


class WorkerGradeSkills(TimestampedModel):
    """Описание навыков монтажника определённого разряда в определённом разделе работ"""
    
    grade = models.ForeignKey(
        WorkerGrade,
        on_delete=models.CASCADE,
        related_name='skills',
        verbose_name='Разряд'
    )
    section = models.ForeignKey(
        WorkSection,
        on_delete=models.CASCADE,
        related_name='grade_skills',
        verbose_name='Раздел работ'
    )
    description = models.TextField(
        verbose_name='Описание навыков'
    )

    class Meta:
        unique_together = ('grade', 'section')
        verbose_name = 'Навыки разряда'
        verbose_name_plural = 'Навыки разрядов'

    def __str__(self):
        return f"{self.grade.name} - {self.section.name}"


class WorkItem(TimestampedModel):
    """Справочник работ с версионированием"""
    
    class Unit(models.TextChoices):
        PIECE = 'шт', 'Штука'
        LINEAR_METER = 'м.п.', 'Метр погонный'
        SQUARE_METER = 'м²', 'Метр квадратный'
        CUBIC_METER = 'м³', 'Метр кубический'
        SET = 'компл', 'Комплект'
        UNIT = 'ед', 'Единица'
        HOUR = 'ч', 'Час'
        KILOGRAM = 'кг', 'Килограмм'
        TON = 'т', 'Тонна'
        POINT = 'точка', 'Точка'

    article = models.CharField(
        max_length=50,
        unique=True,
        verbose_name='Артикул',
        help_text='Например: V-001'
    )
    section = models.ForeignKey(
        WorkSection,
        on_delete=models.PROTECT,
        related_name='work_items',
        verbose_name='Раздел работ'
    )
    name = models.CharField(
        max_length=255,
        verbose_name='Наименование работы'
    )
    unit = models.CharField(
        max_length=20,
        choices=Unit.choices,
        verbose_name='Единица измерения'
    )
    hours = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=Decimal('0'),
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0'))],
        verbose_name='Кол-во часов на единицу',
        help_text='Если не указано, используется 0'
    )
    grade = models.ForeignKey(
        WorkerGrade,
        on_delete=models.PROTECT,
        related_name='work_items',
        verbose_name='Базовый разряд',
        help_text='Ближайший целый разряд вниз для базовой ставки (для дробных разрядов)'
    )
    required_grade = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('1')), MaxValueValidator(Decimal('5'))],
        verbose_name='Требуемый разряд',
        help_text='Точный требуемый разряд работы (может быть дробным, например 3.65)'
    )
    composition = models.TextField(
        blank=True,
        verbose_name='Состав работы',
        help_text='Описание состава работы'
    )
    comment = models.TextField(
        blank=True,
        verbose_name='Комментарий',
        help_text='Дополнительные комментарии к работе'
    )
    coefficient = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('1.00'),
        validators=[MinValueValidator(Decimal('0.01'))],
        verbose_name='Коэффициент сложности'
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
        ordering = ['section', 'article']
        verbose_name = 'Работа'
        verbose_name_plural = 'Работы'

    def __str__(self):
        return f"{self.article} - {self.name}"

    def clean(self):
        if self.hours is not None and self.hours < 0:
            raise ValidationError({'hours': 'Количество часов не может быть отрицательным'})
        if self.coefficient is not None and self.coefficient <= 0:
            raise ValidationError({'coefficient': 'Коэффициент должен быть больше 0'})
    
    def save(self, *args, **kwargs):
        """Автоматически подставляем 0, если часы не указаны"""
        if self.hours is None:
            self.hours = Decimal('0')
        super().save(*args, **kwargs)

    def create_new_version(self) -> 'WorkItem':
        """
        Создать новую версию работы.
        1. Текущая версия: is_current = False
        2. Создать копию с новым article (добавить суффикс версии)
        3. Новая версия: parent_version = self, version_number++, is_current = True
        """
        # Помечаем текущую версию как неактуальную
        self.is_current = False
        self.save(update_fields=['is_current'])

        # Создаём новую версию
        new_version_number = self.version_number + 1
        
        # Генерируем новый артикул (убираем старый суффикс версии, если есть)
        base_article = self.article.rsplit('-v', 1)[0]
        new_article = f"{base_article}-v{new_version_number}"

        new_item = WorkItem.objects.create(
            article=new_article,
            section=self.section,
            name=self.name,
            unit=self.unit,
            hours=self.hours,
            grade=self.grade,
            composition=self.composition,
            comment=self.comment,
            coefficient=self.coefficient,
            parent_version=self,
            version_number=new_version_number,
            is_current=True
        )
        return new_item

    @classmethod
    def get_current_items(cls):
        """Получить только актуальные версии работ"""
        return cls.objects.filter(is_current=True)


class PriceList(TimestampedModel):
    """Прайс-лист с набором работ и ставками по разрядам"""
    
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Черновик'
        ACTIVE = 'active', 'Действующий'
        ARCHIVED = 'archived', 'Архивный'

    number = models.CharField(
        max_length=50,
        verbose_name='Номер прайс-листа'
    )
    name = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Название'
    )
    date = models.DateField(
        verbose_name='Дата прайс-листа'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        verbose_name='Статус'
    )
    grade_1_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
        verbose_name='Ставка 1 разряда'
    )
    grade_2_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
        verbose_name='Ставка 2 разряда'
    )
    grade_3_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
        verbose_name='Ставка 3 разряда'
    )
    grade_4_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
        verbose_name='Ставка 4 разряда'
    )
    grade_5_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0'),
        verbose_name='Ставка 5 разряда'
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
        verbose_name = 'Прайс-лист'
        verbose_name_plural = 'Прайс-листы'

    def __str__(self):
        return f"Прайс-лист №{self.number} от {self.date}"

    def populate_rates_from_grades(self):
        """Заполнить ставки из глобальных разрядов (WorkerGrade)"""
        for grade in WorkerGrade.objects.filter(is_active=True):
            setattr(self, f'grade_{grade.grade}_rate', grade.default_hourly_rate)

    def get_rate_for_grade(self, grade_number) -> Decimal:
        """
        Получить ставку для указанного разряда.
        Поддерживает дробные разряды (например, 2.5, 3.65).
        
        Для дробных разрядов вычисляется взвешенное среднее между соседними разрядами:
        - Для разряда 2.5: (ставка_2 + ставка_3) / 2
        - Для разряда 3.65: ставка_3 * 0.35 + ставка_4 * 0.65
        
        Args:
            grade_number: int или Decimal - номер разряда (1-5, может быть дробным)
        
        Returns:
            Decimal - ставка для разряда
        """
        grade = Decimal(str(grade_number))
        
        # Если разряд целый (1-5), возвращаем напрямую
        if grade == grade.quantize(Decimal('1')):
            grade_int = int(grade)
            if 1 <= grade_int <= 5:
                return getattr(self, f'grade_{grade_int}_rate', Decimal('0'))
            return Decimal('0')
        
        # Для дробных разрядов вычисляем взвешенное среднее между соседними разрядами
        # Примеры:
        # - Для разряда 2.5: (ставка_2 + ставка_3) / 2
        # - Для разряда 3.65: ставка_3 * 0.35 + ставка_4 * 0.65
        grade_lower = int(grade)  # Нижний разряд (например, 2 для 2.5)
        grade_upper = min(grade_lower + 1, 5)  # Верхний разряд (например, 3 для 2.5)
        
        if grade_lower < 1 or grade_upper > 5:
            return Decimal('0')
        
        rate_lower = getattr(self, f'grade_{grade_lower}_rate', Decimal('0'))
        rate_upper = getattr(self, f'grade_{grade_upper}_rate', Decimal('0'))
        
        # Вычисляем веса для взвешенного среднего
        # Для 2.5: weight_lower = 0.5, weight_upper = 0.5 -> (rate_2 + rate_3) / 2
        # Для 3.65: weight_lower = 0.35, weight_upper = 0.65
        fraction = grade - Decimal(str(grade_lower))  # Дробная часть (0.5 для 2.5, 0.65 для 3.65)
        weight_lower = Decimal('1') - fraction  # Вес нижнего разряда
        weight_upper = fraction  # Вес верхнего разряда
        
        # Взвешенное среднее: rate_lower * weight_lower + rate_upper * weight_upper
        # Для 2.5: rate_2 * 0.5 + rate_3 * 0.5 = (rate_2 + rate_3) / 2
        weighted_average = rate_lower * weight_lower + rate_upper * weight_upper
        
        return weighted_average

    def create_new_version(self) -> 'PriceList':
        """
        Создать новую версию прайс-листа.
        1. Текущая версия: status = archived
        2. Создать копию со всеми ставками и позициями
        3. Новая версия: parent_version = self, version_number++
        """
        # Архивируем текущую версию
        self.status = self.Status.ARCHIVED
        self.save(update_fields=['status'])

        # Создаём новую версию
        new_version_number = self.version_number + 1
        new_number = f"{self.number.rsplit('-v', 1)[0]}-v{new_version_number}"

        new_price_list = PriceList.objects.create(
            number=new_number,
            name=self.name,
            date=self.date,
            status=self.Status.DRAFT,
            grade_1_rate=self.grade_1_rate,
            grade_2_rate=self.grade_2_rate,
            grade_3_rate=self.grade_3_rate,
            grade_4_rate=self.grade_4_rate,
            grade_5_rate=self.grade_5_rate,
            parent_version=self,
            version_number=new_version_number
        )

        # Копируем позиции
        for item in self.items.all():
            PriceListItem.objects.create(
                price_list=new_price_list,
                work_item=item.work_item,
                hours_override=item.hours_override,
                coefficient_override=item.coefficient_override,
                grade_override=item.grade_override,
                is_included=item.is_included
            )

        return new_price_list


class PriceListAgreement(models.Model):
    """Связь прайс-листа с контрагентом (Исполнителем), с которым он согласован"""
    
    price_list = models.ForeignKey(
        PriceList,
        on_delete=models.CASCADE,
        related_name='agreements',
        verbose_name='Прайс-лист'
    )
    counterparty = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.PROTECT,
        related_name='price_list_agreements',
        verbose_name='Исполнитель'
    )
    agreed_date = models.DateField(
        verbose_name='Дата согласования'
    )
    notes = models.TextField(
        blank=True,
        verbose_name='Примечания'
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания'
    )

    class Meta:
        unique_together = ('price_list', 'counterparty')
        ordering = ['-agreed_date', '-created_at']
        verbose_name = 'Согласование прайс-листа'
        verbose_name_plural = 'Согласования прайс-листов'

    def __str__(self):
        return f"{self.price_list} - {self.counterparty}"

    def clean(self):
        if self.counterparty_id:
            from accounting.models import Counterparty
            counterparty = self.counterparty
            if counterparty.type not in [Counterparty.Type.VENDOR, Counterparty.Type.BOTH]:
                raise ValidationError({
                    'counterparty': 'Контрагент должен быть Исполнителем/Поставщиком или "Заказчик и Исполнитель"'
                })

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class PriceListItem(models.Model):
    """Связь прайс-листа с работами (M2M через промежуточную таблицу)"""
    
    price_list = models.ForeignKey(
        PriceList,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='Прайс-лист'
    )
    work_item = models.ForeignKey(
        WorkItem,
        on_delete=models.PROTECT,
        related_name='price_list_items',
        verbose_name='Работа'
    )
    hours_override = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Переопределённые часы'
    )
    coefficient_override = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='Переопределённый коэффициент'
    )
    grade_override = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('1')), MaxValueValidator(Decimal('5'))],
        verbose_name='Переопределённый разряд',
        help_text='Дробный разряд для работы (например, 3.65). Если не указан, используется разряд из работы.'
    )
    is_included = models.BooleanField(
        default=True,
        verbose_name='Включена в прайс'
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания'
    )

    class Meta:
        unique_together = ('price_list', 'work_item')
        ordering = ['work_item__section', 'work_item__article']
        verbose_name = 'Позиция прайс-листа'
        verbose_name_plural = 'Позиции прайс-листа'

    def __str__(self):
        return f"{self.price_list.number} - {self.work_item.article}"

    @property
    def effective_hours(self) -> Decimal:
        """Часы (переопределённые или из работы)"""
        if self.hours_override is not None:
            return self.hours_override
        # Если в работе часы не указаны (None), используем 0
        return self.work_item.hours if self.work_item.hours is not None else Decimal('0')

    @property
    def effective_coefficient(self) -> Decimal:
        """Коэффициент (переопределённый или из работы)"""
        return self.coefficient_override if self.coefficient_override is not None else self.work_item.coefficient

    @property
    def effective_grade(self) -> Decimal:
        """
        Эффективный разряд (переопределённый или из работы).
        Может быть дробным (например, 3.65).
        """
        if self.grade_override is not None:
            return self.grade_override
        return Decimal(str(self.work_item.grade.grade))

    @property
    def calculated_cost(self) -> Decimal:
        """
        Вычисленная стоимость работы.
        Стоимость = effective_hours × effective_coefficient × ставка_разряда
        
        Ставка рассчитывается с учётом дробного разряда (линейная интерполяция).
        """
        rate = self.price_list.get_rate_for_grade(self.effective_grade)
        return self.effective_hours * self.effective_coefficient * rate
