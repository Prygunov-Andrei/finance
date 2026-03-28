"""Накопление знаний: сохранение в ProductKnowledge + .md файлы."""
import logging
import os
from pathlib import Path

from django.conf import settings
from django.utils import timezone

from catalog.models import Product, ProductKnowledge
from pricelists.models import WorkItem

logger = logging.getLogger(__name__)

KNOWLEDGE_DIR = os.path.join(settings.BASE_DIR, '..', 'data', 'knowledge', 'products')


def save_knowledge(item_name: str, work_item: WorkItem, source: str,
                   confidence: float, llm_reasoning: str = '',
                   web_query: str = '', web_summary: str = '') -> ProductKnowledge:
    """Сохранить знание в БД и обновить .md файл."""
    normalized = Product.normalize_name(item_name)

    knowledge, created = ProductKnowledge.objects.update_or_create(
        item_name_pattern=normalized,
        work_item=work_item,
        defaults={
            'confidence': confidence,
            'source': source,
            'work_section': work_item.section,
            'llm_reasoning': llm_reasoning,
            'web_search_query': web_query,
            'web_search_result_summary': web_summary,
        }
    )
    if not created:
        ProductKnowledge.objects.filter(pk=knowledge.pk).update(
            usage_count=knowledge.usage_count + 1,
            last_used_at=timezone.now(),
        )

    # Обновить .md файл
    try:
        _update_md_file(normalized, knowledge)
    except Exception:
        logger.exception('Failed to update .md file for %s', normalized)

    return knowledge


def verify_knowledge(item_name_pattern: str, work_item_id: int, user=None):
    """Пометить знание как verified (при принятии пользователем)."""
    ProductKnowledge.objects.filter(
        item_name_pattern=item_name_pattern,
        work_item_id=work_item_id,
    ).update(
        status=ProductKnowledge.Status.VERIFIED,
        verified_by=user,
    )


def reject_knowledge(item_name_pattern: str, work_item_id: int):
    """Пометить знание как rejected (при отклонении пользователем)."""
    ProductKnowledge.objects.filter(
        item_name_pattern=item_name_pattern,
        work_item_id=work_item_id,
    ).update(status=ProductKnowledge.Status.REJECTED)


def _update_md_file(normalized_name: str, knowledge: ProductKnowledge):
    """Обновить или создать .md файл для товара."""
    os.makedirs(KNOWLEDGE_DIR, exist_ok=True)

    # Имя файла: нормализованное имя (заменяем пробелы на дефисы)
    filename = normalized_name.replace(' ', '-')[:80] + '.md'
    filepath = os.path.join(KNOWLEDGE_DIR, filename)

    # Обновляем md_file_path в БД
    rel_path = os.path.join('products', filename)
    if knowledge.md_file_path != rel_path:
        ProductKnowledge.objects.filter(pk=knowledge.pk).update(md_file_path=rel_path)

    # Если файл существует — дополняем, иначе создаём
    if os.path.exists(filepath):
        _append_to_md(filepath, knowledge)
    else:
        _create_md(filepath, normalized_name, knowledge)


def _create_md(filepath: str, name: str, k: ProductKnowledge):
    """Создать новый .md файл знаний."""
    status_label = 'verified' if k.status == ProductKnowledge.Status.VERIFIED else 'pending'
    content = f"""# {name}

## Подходящие расценки
- **{k.work_item.article}** {k.work_item.name} (confidence: {k.confidence:.2f}, {status_label})

## Источник знаний
- {k.get_source_display()} ({timezone.now().strftime('%Y-%m-%d')}): {k.llm_reasoning or 'автоподбор'}
"""
    if k.web_search_result_summary:
        content += f"\n### Web search\n{k.web_search_result_summary}\n"

    content += "\n## Примечания оператора\n\n"

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)


def _append_to_md(filepath: str, k: ProductKnowledge):
    """Дополнить существующий .md файл новой расценкой."""
    status_label = 'verified' if k.status == ProductKnowledge.Status.VERIFIED else 'pending'
    entry = f"- **{k.work_item.article}** {k.work_item.name} (confidence: {k.confidence:.2f}, {status_label})\n"

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Ищем секцию "Подходящие расценки" и добавляем туда
    marker = '## Подходящие расценки\n'
    if marker in content:
        idx = content.index(marker) + len(marker)
        # Проверяем что этой расценки ещё нет
        if k.work_item.article not in content:
            content = content[:idx] + entry + content[idx:]
    else:
        content += f"\n{marker}{entry}"

    # Добавляем источник
    source_entry = f"- {k.get_source_display()} ({timezone.now().strftime('%Y-%m-%d')}): {k.llm_reasoning or 'автоподбор'}\n"
    source_marker = '## Источник знаний\n'
    if source_marker in content:
        idx = content.index(source_marker) + len(source_marker)
        content = content[:idx] + source_entry + content[idx:]

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
