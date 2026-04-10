"""
Дефолтная конфигурация столбцов сметы.
Используется когда estimate.column_config пуст.
"""

DEFAULT_COLUMN_CONFIG = [
    {
        "key": "item_number", "label": "№", "type": "builtin",
        "builtin_field": "item_number", "width": 50, "editable": False,
        "visible": True, "formula": None, "decimal_places": None,
        "aggregatable": False, "options": None,
    },
    {
        "key": "name", "label": "Наименование", "type": "builtin",
        "builtin_field": "name", "width": 250, "editable": True,
        "visible": True, "formula": None, "decimal_places": None,
        "aggregatable": False, "options": None,
    },
    {
        "key": "model_name", "label": "Модель", "type": "builtin",
        "builtin_field": "model_name", "width": 150, "editable": True,
        "visible": True, "formula": None, "decimal_places": None,
        "aggregatable": False, "options": None,
    },
    {
        "key": "unit", "label": "Ед.", "type": "builtin",
        "builtin_field": "unit", "width": 60, "editable": True,
        "visible": True, "formula": None, "decimal_places": None,
        "aggregatable": False, "options": None,
    },
    {
        "key": "quantity", "label": "Кол-во", "type": "builtin",
        "builtin_field": "quantity", "width": 80, "editable": True,
        "visible": True, "formula": None, "decimal_places": 3,
        "aggregatable": False, "options": None,
    },
    {
        "key": "material_unit_price", "label": "Закупка мат.", "type": "builtin",
        "builtin_field": "material_unit_price", "width": 100, "editable": True,
        "visible": True, "formula": None, "decimal_places": 2,
        "aggregatable": False, "options": None,
    },
    {
        "key": "work_unit_price", "label": "Закупка раб.", "type": "builtin",
        "builtin_field": "work_unit_price", "width": 100, "editable": True,
        "visible": True, "formula": None, "decimal_places": 2,
        "aggregatable": False, "options": None,
    },
    {
        "key": "material_total", "label": "Итого закупка мат.", "type": "builtin",
        "builtin_field": "material_total", "width": 110, "editable": False,
        "visible": True, "formula": None, "decimal_places": 2,
        "aggregatable": True, "options": None,
    },
    {
        "key": "work_total", "label": "Итого закупка раб.", "type": "builtin",
        "builtin_field": "work_total", "width": 110, "editable": False,
        "visible": True, "formula": None, "decimal_places": 2,
        "aggregatable": True, "options": None,
    },
    {
        "key": "line_total", "label": "Итого закупка", "type": "builtin",
        "builtin_field": "line_total", "width": 120, "editable": False,
        "visible": True, "formula": None, "decimal_places": 2,
        "aggregatable": True, "options": None,
    },
    # --- Работа ---
    {
        "key": "work_item_name", "label": "Работа", "type": "builtin",
        "builtin_field": "work_item_name", "width": 180, "editable": False,
        "visible": False, "formula": None, "decimal_places": None,
        "aggregatable": False, "options": None,
    },
    # --- Наценки ---
    {
        "key": "effective_material_markup_percent", "label": "Наценка мат. %",
        "type": "builtin", "builtin_field": "effective_material_markup_percent",
        "width": 90, "editable": False, "visible": False,
        "formula": None, "decimal_places": 2, "aggregatable": False, "options": None,
    },
    {
        "key": "effective_work_markup_percent", "label": "Наценка раб. %",
        "type": "builtin", "builtin_field": "effective_work_markup_percent",
        "width": 90, "editable": False, "visible": False,
        "formula": None, "decimal_places": 2, "aggregatable": False, "options": None,
    },
    # --- Продажные цены ---
    {
        "key": "material_sale_unit_price", "label": "Продажа мат.", "type": "builtin",
        "builtin_field": "material_sale_unit_price", "width": 100, "editable": False,
        "visible": True, "formula": None, "decimal_places": 2,
        "aggregatable": False, "options": None,
    },
    {
        "key": "work_sale_unit_price", "label": "Продажа раб.", "type": "builtin",
        "builtin_field": "work_sale_unit_price", "width": 100, "editable": False,
        "visible": True, "formula": None, "decimal_places": 2,
        "aggregatable": False, "options": None,
    },
    {
        "key": "material_sale_total", "label": "Итого продажа мат.", "type": "builtin",
        "builtin_field": "material_sale_total", "width": 120, "editable": False,
        "visible": True, "formula": None, "decimal_places": 2,
        "aggregatable": True, "options": None,
    },
    {
        "key": "work_sale_total", "label": "Итого продажа раб.", "type": "builtin",
        "builtin_field": "work_sale_total", "width": 120, "editable": False,
        "visible": True, "formula": None, "decimal_places": 2,
        "aggregatable": True, "options": None,
    },
]

# Допустимые builtin-поля для маппинга
ALLOWED_BUILTIN_FIELDS = {
    'item_number', 'name', 'model_name', 'unit',
    'quantity', 'material_unit_price', 'work_unit_price',
    'material_total', 'work_total', 'line_total',
    'work_item_name',
    # Наценки
    'material_sale_unit_price', 'work_sale_unit_price',
    'material_purchase_total', 'work_purchase_total',
    'material_sale_total', 'work_sale_total',
    'effective_material_markup_percent', 'effective_work_markup_percent',
}

# Допустимые типы столбцов
ALLOWED_COLUMN_TYPES = {
    'builtin', 'custom_number', 'custom_text', 'custom_date',
    'custom_select', 'custom_checkbox', 'formula',
}
