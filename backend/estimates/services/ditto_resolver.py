"""Разрешение «то же» / «так же» в строках смет.

В строительных спецификациях часто встречается паттерн:
    Строка 14: "Воздуховоды из оцинк. стали 1200х500 δ=0,8 мм"
    Строка 15: "То же 800х300 δ=0,8 мм"

Строка 15 означает тот же материал с другими размерами.

Два сценария:
    A) Размеры внутри name (суффикс после "то же") → extract base_name + suffix
    B) Размеры в отдельном столбце model ("то же" без суффикса) → полное prev_name
"""
import re
import logging

logger = logging.getLogger(__name__)

# Prefix-паттерны "то же" / "так же" в начале строки.
# Покрывает: То же, ТО-ЖЕ, То - же, ТО- ЖЕ, тоже, ТОЖЕ, Так же, также, и т.д.
_DITTO_PREFIX = re.compile(
    r'^(то\s*[-—–]?\s*ж[еёЕЁ]|тож[еёЕЁ]|так\s*[-—–]?\s*ж[еёЕЁ]|такж[еёЕЁ])\s*',
    re.IGNORECASE,
)

# Паттерн начала размерной части в названии
_DIMENSION_START = re.compile(
    r'(\d+\s*[хxX×]\d+'        # 1200х500
    r'|[ØDd]\s*=?\s*\d+'       # Ø125, D=200, d250
    r'|[Дд]\s*=\s*\d+'         # Д=200
    r'|δ\s*='                   # δ=0.8
    r'|\d+\s*мм\b'             # 25 мм
    r')',
)


def is_ditto(name: str) -> bool:
    """Начинается ли name с 'то же' / 'так же' и их вариантов."""
    return bool(_DITTO_PREFIX.match(name.strip()))


def _extract_base_name(full_name: str) -> str:
    """Извлечь базовое имя (до размеров) из полного наименования.

    'Воздуховоды из оцинк. стали 1200х500 δ=0,8 мм' → 'Воздуховоды из оцинк. стали'
    'Клапан обратный' → 'Клапан обратный'
    """
    m = _DIMENSION_START.search(full_name)
    if m:
        return full_name[:m.start()].rstrip(' ,;-')
    return full_name.strip()


def _extract_ditto_suffix(name: str) -> str:
    """Извлечь суффикс после 'то же' / 'так же'.

    'То же 800х300 δ=0,8 мм' → '800х300 δ=0,8 мм'
    'То же' → ''
    """
    m = _DITTO_PREFIX.match(name.strip())
    if m:
        return name.strip()[m.end():]
    return ''


def resolve_ditto(name: str, prev_name: str) -> str:
    """Разрешить одну 'то же' строку.

    Сценарий A (суффикс есть):
        resolve_ditto('То же 800х300', 'Воздуховод 1200х500')
        → 'Воздуховод 800х300'

    Сценарий B (суффикса нет, размеры в model):
        resolve_ditto('То же', 'Воздуховод оцинкованный')
        → 'Воздуховод оцинкованный'
    """
    suffix = _extract_ditto_suffix(name)
    if suffix.strip():
        base = _extract_base_name(prev_name)
        return f'{base} {suffix}'
    return prev_name


def resolve_dittos_in_rows(rows: list, name_key='name') -> int:
    """Разрешить 'то же' во всех строках (in-place). Строки должны быть в порядке.

    Args:
        rows: список dict-ов или объектов с атрибутом name_key
        name_key: ключ/атрибут с именем

    Returns:
        Количество разрешённых строк.
    """
    count = 0
    last_real_name = None

    for row in rows:
        name = row.get(name_key, '') if isinstance(row, dict) else getattr(row, name_key, '')
        if is_ditto(name):
            if last_real_name:
                resolved = resolve_ditto(name, last_real_name)
                if isinstance(row, dict):
                    row[name_key] = resolved
                else:
                    setattr(row, name_key, resolved)
                count += 1
        else:
            if name.strip():
                last_real_name = name

    return count
