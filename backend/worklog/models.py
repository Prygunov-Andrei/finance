import secrets
import string
import uuid
from django.db import models
from django.utils import timezone
from datetime import timedelta
from core.models import TimestampedModel


class Worker(TimestampedModel):
    """Монтажник / Бригадир — зарегистрированный работник в системе фиксации работ."""

    class Role(models.TextChoices):
        WORKER = 'worker', 'Монтажник'
        BRIGADIER = 'brigadier', 'Бригадир'

    class Language(models.TextChoices):
        RU = 'ru', 'Русский'
        UZ = 'uz', 'Узбекский'
        TG = 'tg', 'Таджикский'
        KY = 'ky', 'Киргизский'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    telegram_id = models.BigIntegerField(
        unique=True,
        verbose_name='Telegram ID'
    )
    name = models.CharField(max_length=255, verbose_name='ФИО')
    phone = models.CharField(max_length=32, blank=True, verbose_name='Телефон')
    photo_url = models.URLField(blank=True, verbose_name='URL фото профиля')
    role = models.CharField(
        max_length=16,
        choices=Role.choices,
        default=Role.WORKER,
        verbose_name='Роль'
    )
    language = models.CharField(
        max_length=4,
        choices=Language.choices,
        default=Language.RU,
        verbose_name='Язык интерфейса'
    )
    contractor = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.CASCADE,
        related_name='workers',
        verbose_name='Исполнитель (контрагент)'
    )
    bot_started = models.BooleanField(
        default=False,
        verbose_name='Написал /start боту'
    )

    class Meta:
        verbose_name = 'Монтажник'
        verbose_name_plural = 'Монтажники'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.get_role_display()})"


class Supergroup(TimestampedModel):
    """Telegram-супергруппа для одного Исполнителя на объекте."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    object = models.ForeignKey(
        'objects.Object',
        on_delete=models.CASCADE,
        related_name='supergroups',
        verbose_name='Объект'
    )
    contractor = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.CASCADE,
        related_name='supergroups',
        verbose_name='Исполнитель'
    )
    telegram_group_id = models.BigIntegerField(
        unique=True,
        verbose_name='ID супергруппы в Telegram'
    )
    invite_link = models.URLField(
        blank=True,
        verbose_name='Ссылка-приглашение для монтажников'
    )
    created_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_supergroups',
        verbose_name='Кто создал'
    )

    class Meta:
        verbose_name = 'Супергруппа'
        verbose_name_plural = 'Супергруппы'
        unique_together = ('object', 'contractor')

    def __str__(self):
        return f"{self.object.name} — {self.contractor}"


class Shift(TimestampedModel):
    """Рабочая смена на объекте."""

    class ShiftType(models.TextChoices):
        DAY = 'day', 'Дневная'
        EVENING = 'evening', 'Вечерняя'
        NIGHT = 'night', 'Ночная'

    class Status(models.TextChoices):
        SCHEDULED = 'scheduled', 'Запланирована'
        ACTIVE = 'active', 'Активна'
        CLOSED = 'closed', 'Закрыта'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    contract = models.ForeignKey(
        'contracts.Contract',
        on_delete=models.CASCADE,
        related_name='shifts',
        verbose_name='Договор',
        null=True,
        blank=True,
    )
    object = models.ForeignKey(
        'objects.Object',
        on_delete=models.CASCADE,
        related_name='shifts',
        verbose_name='Объект'
    )
    contractor = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.CASCADE,
        related_name='shifts',
        verbose_name='Исполнитель'
    )
    date = models.DateField(verbose_name='Дата смены')
    shift_type = models.CharField(
        max_length=16,
        choices=ShiftType.choices,
        default=ShiftType.DAY,
        verbose_name='Тип смены'
    )
    start_time = models.TimeField(verbose_name='Время начала')
    end_time = models.TimeField(verbose_name='Время окончания')
    qr_code = models.TextField(blank=True, verbose_name='Данные QR-кода')
    qr_token = models.CharField(
        max_length=128,
        blank=True,
        unique=True,
        verbose_name='Одноразовый токен QR'
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.SCHEDULED,
        verbose_name='Статус'
    )
    extended_until = models.DateTimeField(
        null=True, blank=True,
        verbose_name='Продлена до'
    )

    class Meta:
        verbose_name = 'Смена'
        verbose_name_plural = 'Смены'
        ordering = ['-date', '-start_time']

    def clean(self):
        from django.core.exceptions import ValidationError
        super().clean()
        if self.contract:
            if self.object_id and self.contract.object_id != self.object_id:
                raise ValidationError({
                    'contract': 'Объект договора не совпадает с объектом смены.'
                })
            if self.contractor_id and self.contract.counterparty_id != self.contractor_id:
                raise ValidationError({
                    'contract': 'Исполнитель договора не совпадает с исполнителем смены.'
                })

    def save(self, *args, **kwargs):
        # Автозаполнение object и contractor из contract
        if self.contract:
            self.object = self.contract.object
            self.contractor = self.contract.counterparty
        if not self.qr_token:
            self.qr_token = uuid.uuid4().hex
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.object.name} — {self.date} ({self.get_shift_type_display()})"


class ShiftRegistration(TimestampedModel):
    """Фиксация времени регистрации монтажника на смену."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name='registrations',
        verbose_name='Смена'
    )
    worker = models.ForeignKey(
        Worker,
        on_delete=models.CASCADE,
        related_name='shift_registrations',
        verbose_name='Монтажник'
    )
    registered_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Время регистрации'
    )
    registered_by = models.ForeignKey(
        Worker,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='registered_workers',
        verbose_name='Кто зарегистрировал'
    )
    latitude = models.DecimalField(
        max_digits=10, decimal_places=7,
        null=True, blank=True,
        verbose_name='GPS широта'
    )
    longitude = models.DecimalField(
        max_digits=10, decimal_places=7,
        null=True, blank=True,
        verbose_name='GPS долгота'
    )
    geo_valid = models.BooleanField(
        default=False,
        verbose_name='В геозоне объекта'
    )

    class Meta:
        verbose_name = 'Регистрация на смену'
        verbose_name_plural = 'Регистрации на смены'
        unique_together = ('shift', 'worker')

    def __str__(self):
        return f"{self.worker.name} — {self.shift}"


class Team(TimestampedModel):
    """Звено — группа монтажников, работающих вместе."""

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Активно'
        CLOSED = 'closed', 'Закрыто'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    object = models.ForeignKey(
        'objects.Object',
        on_delete=models.CASCADE,
        related_name='teams',
        verbose_name='Объект'
    )
    contractor = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.CASCADE,
        related_name='teams',
        verbose_name='Исполнитель'
    )
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name='teams',
        verbose_name='Смена'
    )
    topic_id = models.IntegerField(
        null=True, blank=True,
        verbose_name='ID топика в Telegram (message_thread_id)'
    )
    topic_name = models.CharField(
        max_length=255,
        blank=True,
        verbose_name='Название топика'
    )
    members = models.ManyToManyField(
        Worker,
        through='TeamMembership',
        related_name='teams',
        verbose_name='Участники'
    )
    brigadier = models.ForeignKey(
        Worker,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='led_teams',
        verbose_name='Бригадир звена'
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.ACTIVE,
        verbose_name='Статус'
    )
    created_by = models.ForeignKey(
        Worker,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_teams',
        verbose_name='Кто создал звено'
    )
    is_solo = models.BooleanField(
        default=False,
        verbose_name='Соло-режим (один человек)'
    )
    previous_team = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='next_teams',
        verbose_name='Предыдущее звено с тем же составом'
    )

    class Meta:
        verbose_name = 'Звено'
        verbose_name_plural = 'Звенья'
        ordering = ['-created_at']

    def __str__(self):
        return self.topic_name or f"Звено #{str(self.id)[:8]}"


class TeamMembership(TimestampedModel):
    """История участия монтажника в звене."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name='memberships',
        verbose_name='Звено'
    )
    worker = models.ForeignKey(
        Worker,
        on_delete=models.CASCADE,
        related_name='team_memberships',
        verbose_name='Монтажник'
    )
    joined_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Когда присоединился'
    )
    left_at = models.DateTimeField(
        null=True, blank=True,
        verbose_name='Когда вышел'
    )
    triggered_report = models.ForeignKey(
        'Report',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='triggered_by_membership',
        verbose_name='Отчёт при изменении состава'
    )

    class Meta:
        verbose_name = 'Участие в звене'
        verbose_name_plural = 'Участия в звеньях'

    def __str__(self):
        return f"{self.worker.name} в {self.team}"


class Media(TimestampedModel):
    """Фото, видео, аудио, голосовое, текст от монтажников."""

    class MediaType(models.TextChoices):
        PHOTO = 'photo', 'Фото'
        VIDEO = 'video', 'Видео'
        AUDIO = 'audio', 'Аудио'
        VOICE = 'voice', 'Голосовое'
        DOCUMENT = 'document', 'Документ'
        TEXT = 'text', 'Текст'

    class Tag(models.TextChoices):
        NONE = 'none', 'Без тега'
        PROBLEM = 'problem', 'Проблема'
        SUPPLY = 'supply', 'Снабжение'
        FINAL_REPORT = 'final_report', 'Финальное фото'

    class TagSource(models.TextChoices):
        NONE = 'none', 'Нет'
        REACTION = 'reaction', 'Реакция'
        HASHTAG = 'hashtag', 'Хештег'
        MANUAL = 'manual', 'Вручную'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Ожидает скачивания'
        DOWNLOADED = 'downloaded', 'Скачано'
        COMMITTED = 'committed', 'В отчёте'
        DELETED = 'deleted', 'Удалено'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='media',
        verbose_name='Звено'
    )
    report = models.ForeignKey(
        'Report',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='media',
        verbose_name='Отчёт'
    )
    author = models.ForeignKey(
        Worker,
        on_delete=models.CASCADE,
        related_name='media',
        verbose_name='Автор'
    )
    message_id = models.IntegerField(
        null=True, blank=True,
        verbose_name='ID сообщения в Telegram'
    )
    media_type = models.CharField(
        max_length=16,
        choices=MediaType.choices,
        verbose_name='Тип медиа'
    )
    tag = models.CharField(
        max_length=16,
        choices=Tag.choices,
        default=Tag.NONE,
        verbose_name='Тег'
    )
    tag_source = models.CharField(
        max_length=16,
        choices=TagSource.choices,
        default=TagSource.NONE,
        verbose_name='Источник тега'
    )
    file_id = models.CharField(
        max_length=512,
        blank=True,
        verbose_name='Telegram file_id'
    )
    file_unique_id = models.CharField(
        max_length=256,
        blank=True,
        verbose_name='Telegram file_unique_id'
    )
    file_url = models.URLField(
        blank=True,
        verbose_name='URL в S3'
    )
    file_size = models.IntegerField(
        null=True, blank=True,
        verbose_name='Размер в байтах'
    )
    duration = models.IntegerField(
        null=True, blank=True,
        verbose_name='Длительность (сек)'
    )
    thumbnail_url = models.URLField(
        blank=True,
        verbose_name='URL превью'
    )
    text_content = models.TextField(
        blank=True,
        verbose_name='Текст / подпись'
    )
    exif_date = models.DateTimeField(
        null=True, blank=True,
        verbose_name='Дата из EXIF'
    )
    phash = models.CharField(
        max_length=64,
        blank=True,
        verbose_name='Perceptual hash'
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name='Статус'
    )

    class Meta:
        verbose_name = 'Медиа'
        verbose_name_plural = 'Медиа'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_media_type_display()} от {self.author.name}"


class Report(TimestampedModel):
    """Отчёт — фиксация (коммит) медиа звена за период."""

    class ReportType(models.TextChoices):
        INTERMEDIATE = 'intermediate', 'Промежуточный'
        FINAL = 'final', 'Финальный'
        SUPPLEMENT = 'supplement', 'Дополнение'

    class Trigger(models.TextChoices):
        MANUAL = 'manual', 'Вручную'
        MEMBER_CHANGE = 'member_change', 'Изменение состава'
        SHIFT_END = 'shift_end', 'Закрытие смены'
        AUTO = 'auto', 'Автоматически'

    class Status(models.TextChoices):
        SUBMITTED = 'submitted', 'Отправлен'
        QUESTIONS_PENDING = 'questions_pending', 'Ожидает ответов'
        COMPLETED = 'completed', 'Завершён'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name='reports',
        verbose_name='Звено'
    )
    shift = models.ForeignKey(
        Shift,
        on_delete=models.CASCADE,
        related_name='reports',
        verbose_name='Смена'
    )
    parent_report = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='supplements',
        verbose_name='Родительский отчёт'
    )
    report_number = models.IntegerField(
        default=1,
        verbose_name='Номер отчёта за смену'
    )
    report_type = models.CharField(
        max_length=16,
        choices=ReportType.choices,
        verbose_name='Тип отчёта'
    )
    trigger = models.CharField(
        max_length=16,
        choices=Trigger.choices,
        verbose_name='Триггер создания'
    )
    created_by = models.ForeignKey(
        Worker,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_reports',
        verbose_name='Кто создал'
    )
    media_count = models.IntegerField(
        default=0,
        verbose_name='Количество медиа'
    )
    members_snapshot = models.JSONField(
        default=list,
        blank=True,
        verbose_name='Состав звена на момент отчёта'
    )
    divider_message_id = models.IntegerField(
        null=True, blank=True,
        verbose_name='ID разделителя в Telegram'
    )
    first_message_id = models.IntegerField(
        null=True, blank=True,
        verbose_name='Первый message_id в отчёте'
    )
    last_message_id = models.IntegerField(
        null=True, blank=True,
        verbose_name='Последний message_id в отчёте'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SUBMITTED,
        verbose_name='Статус'
    )

    class Meta:
        verbose_name = 'Отчёт'
        verbose_name_plural = 'Отчёты'
        ordering = ['-created_at']

    def __str__(self):
        return f"Отчёт #{self.report_number} ({self.get_report_type_display()}) — {self.team}"


class Question(TimestampedModel):
    """Уточняющий вопрос к звену/монтажнику."""

    class AskedBy(models.TextChoices):
        BACKEND_AUTO = 'backend_auto', 'Автоматически (бекенд)'
        OFFICE = 'office', 'Офис'
        CONTRACTOR = 'contractor', 'Исполнитель'

    class QuestionType(models.TextChoices):
        TEXT = 'text', 'Свободный ввод'
        CHOICE = 'choice', 'Выбор из вариантов'
        MEDIA = 'media', 'Запрос медиа'
        CONFIRM = 'confirm', 'Да/Нет'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Ожидает ответа'
        ANSWERED = 'answered', 'Отвечен'
        EXPIRED = 'expired', 'Просрочен'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(
        Report,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='questions',
        verbose_name='Отчёт'
    )
    team = models.ForeignKey(
        Team,
        on_delete=models.CASCADE,
        related_name='questions',
        verbose_name='Звено'
    )
    asked_by = models.CharField(
        max_length=16,
        choices=AskedBy.choices,
        verbose_name='Кто задал'
    )
    asked_by_user = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='asked_questions',
        verbose_name='Пользователь-автор'
    )
    target_user = models.ForeignKey(
        Worker,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='targeted_questions',
        verbose_name='Кому адресован'
    )
    question_text = models.TextField(verbose_name='Текст вопроса')
    question_type = models.CharField(
        max_length=16,
        choices=QuestionType.choices,
        default=QuestionType.TEXT,
        verbose_name='Тип вопроса'
    )
    choices = models.JSONField(
        default=list,
        blank=True,
        verbose_name='Варианты ответа'
    )
    message_id = models.IntegerField(
        null=True, blank=True,
        verbose_name='ID сообщения с вопросом в Telegram'
    )
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name='Статус'
    )

    class Meta:
        verbose_name = 'Вопрос'
        verbose_name_plural = 'Вопросы'
        ordering = ['-created_at']

    def __str__(self):
        return f"Вопрос: {self.question_text[:50]}"


class Answer(TimestampedModel):
    """Ответ на уточняющий вопрос."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    question = models.ForeignKey(
        Question,
        on_delete=models.CASCADE,
        related_name='answers',
        verbose_name='Вопрос'
    )
    answered_by = models.ForeignKey(
        Worker,
        on_delete=models.CASCADE,
        related_name='answers',
        verbose_name='Кто ответил'
    )
    answer_text = models.TextField(
        blank=True,
        verbose_name='Текст ответа'
    )
    answer_media = models.ForeignKey(
        Media,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='answer_for',
        verbose_name='Медиа-ответ'
    )
    message_id = models.IntegerField(
        null=True, blank=True,
        verbose_name='ID сообщения с ответом в Telegram'
    )

    class Meta:
        verbose_name = 'Ответ'
        verbose_name_plural = 'Ответы'
        ordering = ['-created_at']

    def __str__(self):
        return f"Ответ от {self.answered_by.name}"


def _generate_invite_code():
    """Генерирует случайный 12-символьный код (base62)."""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(12))


def _default_invite_expires():
    """Срок по умолчанию: +7 дней."""
    return timezone.now() + timedelta(days=7)


class InviteToken(TimestampedModel):
    """Токен-приглашение для регистрации монтажника через Telegram deep-link."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(
        max_length=32,
        unique=True,
        default=_generate_invite_code,
        verbose_name='Код приглашения'
    )
    contractor = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.CASCADE,
        related_name='invite_tokens',
        verbose_name='Исполнитель'
    )
    created_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='created_invites',
        verbose_name='Кто создал'
    )
    role = models.CharField(
        max_length=16,
        choices=Worker.Role.choices,
        default=Worker.Role.WORKER,
        verbose_name='Роль приглашённого'
    )
    expires_at = models.DateTimeField(
        default=_default_invite_expires,
        verbose_name='Действителен до'
    )
    used = models.BooleanField(
        default=False,
        verbose_name='Использован'
    )
    used_by = models.ForeignKey(
        Worker,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='used_invite',
        verbose_name='Кто использовал'
    )
    used_at = models.DateTimeField(
        null=True, blank=True,
        verbose_name='Когда использован'
    )

    class Meta:
        verbose_name = 'Приглашение'
        verbose_name_plural = 'Приглашения'
        ordering = ['-created_at']

    @property
    def is_valid(self):
        return not self.used and self.expires_at > timezone.now()

    @property
    def bot_link(self):
        return f"https://t.me/avgust_worklog_bot?start=inv_{self.code}"

    def __str__(self):
        status = 'использован' if self.used else ('истёк' if self.expires_at <= timezone.now() else 'активен')
        return f"Invite {self.code[:8]}… ({status}) — {self.contractor}"
