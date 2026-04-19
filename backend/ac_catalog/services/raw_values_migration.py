"""Перенос ModelRawValue между версиями методики.

После рефакторинга Criterion стал standalone — raw values привязаны к параметру,
а не к методике. Миграция значений между методиками больше не требуется,
т.к. все методики ссылаются на одни и те же Criterion записи.

Оставлен как no-op stub: его импортирует ac_methodology/admin/methodology_version.py
(используется при сохранении активной методики). При желании в будущем функцию
можно удалить и убрать вызов из админки.
"""

from __future__ import annotations


def migrate_model_raw_values_between_methodologies(
    source_methodology_id: int | None,
    target_methodology_id: int,
) -> int:
    """No-op: raw values now reference standalone Criterion, shared across methodologies."""
    return 0
