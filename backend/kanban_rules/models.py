import uuid
from django.db import models

from kanban_core.models import Board, CardEvent


class Rule(models.Model):
    """
    Lite rules engine:
    - event_type: на какое событие реагируем
    - conditions: ограниченный JSON DSL (V1)
    - actions: список действий (V1)
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='rules')
    is_active = models.BooleanField(default=True)

    event_type = models.CharField(max_length=64)
    title = models.CharField(max_length=255, blank=True)

    conditions = models.JSONField(default=dict, blank=True)
    actions = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Правило'
        verbose_name_plural = 'Правила'
        indexes = [
            models.Index(fields=['board', 'event_type', 'is_active']),
        ]


class RuleExecution(models.Model):
    """
    Дедуп: один rule + один event исполняется максимум один раз.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rule = models.ForeignKey(Rule, on_delete=models.CASCADE, related_name='executions')
    event = models.ForeignKey(CardEvent, on_delete=models.CASCADE, related_name='rule_executions')

    status = models.CharField(max_length=16, default='ok')
    error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('rule', 'event')]
        indexes = [
            models.Index(fields=['created_at']),
        ]

