"""Internationalization utilities for the rating API (TZ section 21).

Перенесено 1-в-1 из ac-rating/review/backend/core/i18n.py. У нас живёт в
ac_catalog, потому что это утилита домена «рейтинг кондиционеров»; общий
ERP-модуль `core/` оставляем нетронутым.
"""

from __future__ import annotations

SUPPORTED_LANGUAGES = ("ru", "en", "de", "pt")
DEFAULT_LANGUAGE = "ru"

FIELD_SUFFIX_MAP = {
    "ru": "_ru",
    "en": "_en",
    "de": "_de",
    "pt": "_pt",
}


def get_localized_field(obj, field_base: str, lang: str = DEFAULT_LANGUAGE) -> str:
    """Get localized field value with fallback to Russian."""
    suffix = FIELD_SUFFIX_MAP.get(lang, "_ru")
    value = getattr(obj, f"{field_base}{suffix}", "")
    if not value and lang != DEFAULT_LANGUAGE:
        value = getattr(obj, f"{field_base}_ru", "")
    return value or ""


UI_STRINGS = {
    "ru": {
        "rating_title": "Рейтинг кондиционеров",
        "index_label": "Индекс «Август-климат»",
        "parameters": "Параметры",
        "video_review": "Видеообзор",
        "data_sources": "Источники данных",
        "above_reference": "выше эталона",
        "back_to_rating": "Назад к рейтингу",
        "all_regions": "Все регионы",
        "brand_search": "Поиск по бренду...",
        "not_found": "Модели не найдены",
    },
    "en": {
        "rating_title": "Air Conditioner Rating",
        "index_label": "August-Klimat Index",
        "parameters": "Parameters",
        "video_review": "Video Review",
        "data_sources": "Data Sources",
        "above_reference": "above reference",
        "back_to_rating": "Back to rating",
        "all_regions": "All regions",
        "brand_search": "Search by brand...",
        "not_found": "No models found",
    },
    "de": {
        "rating_title": "Klimaanlagen-Bewertung",
        "index_label": "August-Klimat-Index",
        "parameters": "Parameter",
        "video_review": "Videobewertung",
        "data_sources": "Datenquellen",
        "above_reference": "\u00fcber dem Referenzwert",
        "back_to_rating": "Zur\u00fcck zur Bewertung",
        "all_regions": "Alle Regionen",
        "brand_search": "Nach Marke suchen...",
        "not_found": "Keine Modelle gefunden",
    },
    "pt": {
        "rating_title": "Classifica\u00e7\u00e3o de Ar Condicionado",
        "index_label": "\u00cdndice August-Klimat",
        "parameters": "Par\u00e2metros",
        "video_review": "V\u00eddeo An\u00e1lise",
        "data_sources": "Fontes de Dados",
        "above_reference": "acima da refer\u00eancia",
        "back_to_rating": "Voltar \u00e0 classifica\u00e7\u00e3o",
        "all_regions": "Todas as regi\u00f5es",
        "brand_search": "Pesquisar por marca...",
        "not_found": "Nenhum modelo encontrado",
    },
}


def get_ui_string(key: str, lang: str = DEFAULT_LANGUAGE) -> str:
    strings = UI_STRINGS.get(lang, UI_STRINGS[DEFAULT_LANGUAGE])
    return strings.get(key, UI_STRINGS[DEFAULT_LANGUAGE].get(key, key))
