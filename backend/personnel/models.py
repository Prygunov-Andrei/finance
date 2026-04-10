from collections import OrderedDict

from django.db import models
from django.contrib.auth.models import User
from core.models import TimestampedModel


# ---------- Иерархический реестр ERP-разрешений ----------
# Каждый раздел может содержать подразделы (children).
# Ключи подразделов хранятся в формате «section.subsection».
ERP_PERMISSION_TREE = OrderedDict([
    ('dashboard', {
        'label': 'Пункт управления',
        'children': OrderedDict(),
    }),
    ('commercial', {
        'label': 'Коммерческие предложения',
        'children': OrderedDict([
            ('kanban', 'Канбан КП'),
            ('tkp', 'ТКП'),
            ('mp', 'МП'),
            ('estimates', 'Сметы'),
        ]),
    }),
    ('objects', {
        'label': 'Объекты',
        'children': OrderedDict(),
    }),
    ('finance', {
        'label': 'Финансы',
        'children': OrderedDict([
            ('dashboard', 'Дашборд'),
            ('payments', 'Платежи'),
            ('statements', 'Выписки'),
            ('recurring', 'Периодические платежи'),
            ('debtors', 'Дебиторская задолженность'),
            ('accounting', 'Бухгалтерия'),
            ('budget', 'Расходный бюджет'),
            ('indicators', 'Финансовые показатели'),
        ]),
    }),
    ('contracts', {
        'label': 'Договоры',
        'children': OrderedDict([
            ('framework', 'Рамочные договоры'),
            ('object_contracts', 'Договоры по объектам'),
            ('estimates', 'Сметы'),
            ('mounting_estimates', 'Монтажные сметы'),
            ('acts', 'Акты'),
            ('household', 'Хозяйственные договоры'),
        ]),
    }),
    ('supply', {
        'label': 'Снабжение и Склад',
        'children': OrderedDict([
            ('kanban', 'Канбан снабжения'),
            ('invoices', 'Счета на оплату'),
            ('drivers', 'Календарь водителей'),
            ('moderation', 'Модерация товаров'),
            ('warehouse', 'Склад'),
        ]),
    }),
    ('goods', {
        'label': 'Товары и услуги',
        'children': OrderedDict([
            ('categories', 'Категории'),
            ('catalog', 'Номенклатура'),
            ('moderation', 'Модерация'),
            ('works', 'Каталог работ'),
            ('pricelists', 'Прайс-листы'),
            ('grades', 'Разряды монтажников'),
        ]),
    }),
    ('pto', {
        'label': 'ПТО',
        'children': OrderedDict([
            ('projects', 'Проекты'),
            ('production', 'Производственная документация'),
            ('executive', 'Исполнительная документация'),
            ('samples', 'Образцы документов'),
            ('knowledge', 'Руководящие документы'),
        ]),
    }),
    ('marketing', {
        'label': 'Маркетинг',
        'children': OrderedDict([
            ('kanban', 'Канбан поиска объектов'),
            ('potential_customers', 'Потенциальные заказчики'),
            ('executors', 'Поиск исполнителей'),
            ('campaigns', 'Рассылки'),
            ('avito', 'Интеграция Avito'),
        ]),
    }),
    ('communications', {
        'label': 'Переписка',
        'children': OrderedDict(),
    }),
    ('settings', {
        'label': 'Справочники и настройки',
        'children': OrderedDict([
            ('work_conditions', 'Фронт работ и монтажные условия'),
            ('personnel', 'Персонал'),
            ('counterparties', 'Контрагенты'),
            ('config', 'Настройки'),
        ]),
    }),
    ('help', {
        'label': 'Справка',
        'children': OrderedDict(),
    }),
    # Спец-разрешения (критические операции)
    ('finance_approve', {
        'label': 'Одобрение платежей',
        'children': OrderedDict(),
    }),
    ('supply_approve', {
        'label': 'Одобрение счетов',
        'children': OrderedDict(),
    }),
    ('kanban_admin', {
        'label': 'Администрирование канбана',
        'children': OrderedDict(),
    }),
])

PERMISSION_LEVELS = ('none', 'read', 'edit')


def get_all_permission_keys():
    """Возвращает плоский список всех допустимых ключей разрешений."""
    keys = []
    for section_code, section_data in ERP_PERMISSION_TREE.items():
        keys.append(section_code)
        for child_code in section_data['children']:
            keys.append(f'{section_code}.{child_code}')
    return keys


def default_erp_permissions():
    """Возвращает словарь с дефолтными правами (none) для всех ключей."""
    return {key: 'none' for key in get_all_permission_keys()}


def resolve_permission_level(perms, section_key):
    """Разрешает уровень доступа с fallback на родительский раздел."""
    level = perms.get(section_key)
    if level is not None:
        return level
    if '.' in section_key:
        parent = section_key.split('.')[0]
        return perms.get(parent, 'none')
    return 'none'


class Employee(TimestampedModel):
    """Сотрудник компании"""

    class Gender(models.TextChoices):
        MALE = 'M', 'Мужской'
        FEMALE = 'F', 'Женский'

    # --- Основные данные ---
    full_name = models.CharField(
        max_length=255,
        verbose_name='ФИО',
    )
    date_of_birth = models.DateField(
        null=True,
        blank=True,
        verbose_name='Дата рождения',
    )
    gender = models.CharField(
        max_length=1,
        choices=Gender.choices,
        blank=True,
        verbose_name='Пол',
    )

    # --- Текущие (денормализованные для быстрого доступа) ---
    current_position = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Текущая должность',
    )
    hire_date = models.DateField(
        null=True,
        blank=True,
        verbose_name='Дата приёма на работу',
    )
    salary_full = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name='Оклад полный (руб.)',
    )
    salary_official = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        verbose_name='Оклад официальный (руб.)',
    )

    responsibilities = models.TextField(
        blank=True,
        verbose_name='Обязанности',
    )

    # --- Банковские реквизиты ---
    bank_name = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Наименование банка',
    )
    bank_bik = models.CharField(
        max_length=9,
        blank=True,
        verbose_name='БИК',
    )
    bank_corr_account = models.CharField(
        max_length=20,
        blank=True,
        verbose_name='Корр. счёт',
    )
    bank_account = models.CharField(
        max_length=20,
        blank=True,
        verbose_name='Расчётный счёт',
    )
    bank_card_number = models.CharField(
        max_length=19,
        blank=True,
        verbose_name='Номер карты',
    )

    # --- Связи ---
    user = models.OneToOneField(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employee',
        verbose_name='Пользователь ERP',
        help_text='Опционально: привязка к учётной записи для входа в систему',
    )
    counterparty = models.OneToOneField(
        'accounting.Counterparty',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employee_record',
        verbose_name='Контрагент',
        help_text='Контрагент для выплаты зарплаты',
    )
    supervisors = models.ManyToManyField(
        'self',
        symmetrical=False,
        related_name='subordinates',
        blank=True,
        verbose_name='Руководители',
        help_text='Непосредственные руководители (матричная структура)',
    )

    # --- Права доступа ERP ---
    erp_permissions = models.JSONField(
        default=default_erp_permissions,
        blank=True,
        verbose_name='Права доступа ERP',
        help_text='{"objects":"read","payments":"edit",...}',
    )

    is_active = models.BooleanField(
        default=True,
        verbose_name='Активен',
    )

    class Meta:
        verbose_name = 'Сотрудник'
        verbose_name_plural = 'Сотрудники'
        ordering = ['full_name']

    def __str__(self):
        return self.full_name


class PositionRecord(TimestampedModel):
    """Запись о должности сотрудника (история должностей + трудоустройство)"""

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='positions',
        verbose_name='Сотрудник',
    )
    legal_entity = models.ForeignKey(
        'accounting.LegalEntity',
        on_delete=models.CASCADE,
        related_name='position_records',
        verbose_name='Юридическое лицо',
    )
    position_title = models.CharField(
        max_length=255,
        verbose_name='Наименование должности',
    )
    start_date = models.DateField(
        verbose_name='Дата начала',
    )
    end_date = models.DateField(
        null=True,
        blank=True,
        verbose_name='Дата окончания',
        help_text='Пусто = текущая должность',
    )
    is_current = models.BooleanField(
        default=True,
        verbose_name='Текущая',
    )
    order_number = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Номер приказа',
    )
    notes = models.TextField(
        blank=True,
        verbose_name='Примечания',
    )

    class Meta:
        verbose_name = 'Запись о должности'
        verbose_name_plural = 'Записи о должностях'
        ordering = ['-start_date']

    def __str__(self):
        return f'{self.employee.full_name} — {self.position_title} ({self.legal_entity.short_name})'


class SalaryHistory(TimestampedModel):
    """История изменения оклада сотрудника"""

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='salary_history',
        verbose_name='Сотрудник',
    )
    salary_full = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='Оклад полный (руб.)',
    )
    salary_official = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        verbose_name='Оклад официальный (руб.)',
    )
    effective_date = models.DateField(
        verbose_name='Дата вступления в силу',
    )
    reason = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Причина изменения',
        help_text='Повышение, индексация, перевод и т.д.',
    )

    class Meta:
        verbose_name = 'Запись об окладе'
        verbose_name_plural = 'История окладов'
        ordering = ['-effective_date']

    def __str__(self):
        return f'{self.employee.full_name} — {self.salary_full} руб. с {self.effective_date}'
