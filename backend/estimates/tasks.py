from __future__ import annotations

import json
import logging
import os
import time
import uuid
from decimal import Decimal

import fitz  # PyMuPDF
import redis
from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)

from django.conf import settings as django_settings
SESSION_TTL = getattr(django_settings, 'ESTIMATE_SESSION_TTL', 3600)
PAGE_DPI = getattr(django_settings, 'ESTIMATE_IMPORT_PAGE_DPI', 100)

SINGLE_PAGE_SYSTEM_PROMPT = """Ты — эксперт по строительным сметам.
Тебе дана ОДНА СТРАНИЦА из многостраничной сметы (конвертирована в изображение).

Извлеки все строки сметы с этой страницы. Игнорируй заголовки таблицы (шапку) и итоговые строки ("Итого", "Всего").

Для каждой строки укажи:
- item_number: порядковый номер на этой странице (начиная с 1)
- name: наименование товара/материала/оборудования (строка)
- model_name: модель/марка/артикул ("" если нет)
- unit: единица измерения (шт, м.п., м², компл, кг и т.д.)
- quantity: количество (число)
- material_unit_price: цена материала за единицу (число, 0 если нет)
- work_unit_price: цена работы за единицу (число, 0 если нет)
- section_name: название раздела/системы, если виден на странице ("" если нет)

Если страница содержит только заголовок, оглавление, титул или итоги — верни пустой массив rows.

Верни ТОЛЬКО валидный JSON без markdown-форматирования:
{"rows": [...], "sections": ["..."], "confidence": 0.85}"""


def _get_redis():
    """Подключение к Redis. Делегирует в общий get_redis()."""
    from estimates.services.redis_session import get_redis
    return get_redis()


def _json_default(obj):
    """Сериализатор для Decimal и прочих типов."""
    if isinstance(obj, Decimal):
        return str(obj)
    return str(obj)


def create_import_session(file_content: bytes, estimate_id: int, user_id: int = 0) -> dict:
    """Создаёт сессию импорта: сохраняет PDF на диск, считает страницы, пишет в Redis."""
    session_id = uuid.uuid4().hex[:16]

    # Сохраняем файл на диск
    tmp_dir = os.path.join(settings.MEDIA_ROOT, 'tmp', 'estimate_imports')
    os.makedirs(tmp_dir, exist_ok=True)
    file_path = os.path.join(tmp_dir, f'{session_id}.pdf')
    with open(file_path, 'wb') as f:
        f.write(file_content)

    # Считаем страницы
    doc = fitz.open(file_path)
    total_pages = len(doc)
    doc.close()

    # B22: пишем начальное состояние в Redis (включая user_id)
    r = _get_redis()
    r.hset(f'estimate_import:{session_id}', mapping={
        'status': 'processing',
        'total_pages': str(total_pages),
        'current_page': '0',
        'rows': '[]',
        'sections': '[]',
        'errors': '[]',
        'file_path': file_path,
        'estimate_id': str(estimate_id),
        'user_id': str(user_id),
    })
    r.expire(f'estimate_import:{session_id}', SESSION_TTL)

    return {
        'session_id': session_id,
        'total_pages': total_pages,
    }


def get_session_data(session_id: str) -> dict | None:
    """Читает текущее состояние сессии из Redis."""
    r = _get_redis()
    data = r.hgetall(f'estimate_import:{session_id}')
    if not data:
        return None
    return {
        'session_id': session_id,
        'status': data.get('status', 'error'),
        'total_pages': int(data.get('total_pages', 0)),
        'current_page': int(data.get('current_page', 0)),
        'rows': json.loads(data.get('rows', '[]')),
        'sections': json.loads(data.get('sections', '[]')),
        'errors': json.loads(data.get('errors', '[]')),
        'user_id': data.get('user_id', ''),
    }


def cancel_session(session_id: str) -> bool:
    """Отменяет сессию. Задача проверит статус перед следующей страницей."""
    r = _get_redis()
    key = f'estimate_import:{session_id}'
    if r.exists(key):
        r.hset(key, 'status', 'cancelled')
        return True
    return False


def _cleanup_file(file_path: str):
    try:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        # B20: логируем ошибку cleanup
        logger.warning('Failed to cleanup import file %s: %s', file_path, e)


@shared_task(bind=True, max_retries=0, time_limit=3600, soft_time_limit=3400)
def process_estimate_pdf_pages(self, session_id: str):
    """
    Обрабатывает PDF постранично: каждая страница → LLM → результат в Redis.
    Фронтенд поллит Redis и видит строки по мере их появления.
    """
    from llm_services.models import LLMProvider
    from llm_services.providers import get_provider
    from llm_services.services.exceptions import RateLimitError

    r = _get_redis()
    key = f'estimate_import:{session_id}'

    session_data = r.hgetall(key)
    if not session_data:
        logger.error('Session %s not found in Redis', session_id)
        return

    file_path = session_data['file_path']
    total_pages = int(session_data['total_pages'])

    try:
        _process_pdf_pages(r, key, session_id, file_path, total_pages)
    except Exception:
        logger.exception('Session %s: unexpected error', session_id)
        r.hset(key, 'status', 'error')
    finally:
        _cleanup_file(file_path)


def _process_pdf_pages(r, key, session_id, file_path, total_pages):
    from llm_services.models import LLMProvider
    from llm_services.providers import get_provider
    from llm_services.services.exceptions import RateLimitError

    # Получаем LLM-провайдер
    provider_model = LLMProvider.get_default()
    if not provider_model:
        r.hset(key, 'status', 'error')
        logger.error('No default LLM provider configured')
        return

    provider = get_provider(provider_model)

    all_rows = []
    all_sections = set()
    errors = []
    item_counter = 0

    doc = fitz.open(file_path)

    try:
        for page_num in range(total_pages):
            # Проверяем, не отменена ли сессия
            current_status = r.hget(key, 'status')
            if current_status in ('cancelled', 'error'):
                logger.info('Session %s cancelled/errored at page %d', session_id, page_num + 1)
                return

            page_success = False
            retries = 0
            max_page_retries = 2

            while not page_success and retries <= max_page_retries:
                try:
                    # Рендерим одну страницу в PNG
                    page = doc.load_page(page_num)
                    mat = fitz.Matrix(PAGE_DPI / 72, PAGE_DPI / 72)
                    pix = page.get_pixmap(matrix=mat)
                    img_bytes = pix.tobytes("png")

                    # Отправляем в LLM
                    response = provider.parse_with_prompt(
                        file_content=img_bytes,
                        file_type='png',
                        system_prompt=SINGLE_PAGE_SYSTEM_PROMPT,
                        user_prompt=f'Извлеки строки сметы со страницы {page_num + 1}:',
                    )

                    # Парсим ответ
                    page_rows = response.get('rows', [])
                    page_sections = response.get('sections', [])

                    for row_data in page_rows:
                        name = row_data.get('name', '').strip()
                        if not name:
                            continue
                        item_counter += 1
                        row_data['item_number'] = item_counter
                        all_rows.append(row_data)
                        section = row_data.get('section_name', '')
                        if section:
                            all_sections.add(section)

                    for s in page_sections:
                        if s:
                            all_sections.add(s)

                    page_success = True

                except RateLimitError as e:
                    retries += 1
                    if retries <= max_page_retries:
                        logger.warning('Rate limit on page %d, retry %d: %s', page_num + 1, retries, e)
                        time.sleep(30)
                    else:
                        logger.warning('Rate limit on page %d, skipping: %s', page_num + 1, e)
                        errors.append({'page': page_num + 1, 'error': f'Rate limit: {e}'})
                except Exception as e:
                    # B21: 1 retry для обычных ошибок
                    retries += 1
                    if retries <= 1:
                        logger.warning('Error on page %d, retrying: %s', page_num + 1, e)
                        time.sleep(5)
                    else:
                        logger.warning('Error on page %d, skipping: %s', page_num + 1, e)
                        errors.append({'page': page_num + 1, 'error': str(e)})
                        page_success = True

            # Обновляем Redis после каждой страницы
            r.hset(key, mapping={
                'current_page': str(page_num + 1),
                'rows': json.dumps(all_rows, ensure_ascii=False, default=_json_default),
                'sections': json.dumps(list(all_sections), ensure_ascii=False),
                'errors': json.dumps(errors, ensure_ascii=False),
            })
            r.expire(key, SESSION_TTL)
    finally:
        doc.close()

    # Разрешить "то же" / "так же" строки
    from estimates.services.ditto_resolver import resolve_dittos_in_rows
    resolved_count = resolve_dittos_in_rows(all_rows, name_key='name')
    if resolved_count:
        logger.info('Session %s: resolved %d "то же" rows', session_id, resolved_count)
        # Обновить rows в Redis с разрешёнными именами
        r.hset(key, 'rows', json.dumps(all_rows, ensure_ascii=False, default=_json_default))

    # Завершение
    r.hset(key, 'status', 'completed')
    r.expire(key, SESSION_TTL)

    logger.info(
        'Session %s completed: %d pages, %d rows, %d errors',
        session_id, total_pages, len(all_rows), len(errors),
    )
