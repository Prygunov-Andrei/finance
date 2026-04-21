"""seed_materials — справочник материалов/оборудования ОВиК/СС для demo workspace.

Идемпотентная команда: Material.objects.get_or_create по
(workspace, name, model_name, brand) → повторный запуск не плодит дубли.

Позиции:
- Кабели (витая пара / силовые): 5
- Воздуховоды прямоугольные и круглые + фасонные части: 13
- Решётки / диффузоры: 4
- Крепёж: 5
- Изоляция: 4
- Трасса кондиционеров (медь): 3
- Монтажные элементы: 6
- Прочее ОВиК (клапаны, шумоглушители): 5

Итого 45 материалов для workspace "Август Климат" (UUID совпадает с
seed_dev_data::WS_AVGUST_ID).

Цены RUB — ориентир по ОВиК/СС рынку РФ, март–апрель 2026.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TypedDict

from django.core.management.base import BaseCommand

from apps.estimate.models import Material
from apps.workspace.models import Workspace

# Тот же UUID что в apps.workspace.management.commands.seed_dev_data::WS_AVGUST_ID.
WS_AVGUST_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")


class MaterialSpec(TypedDict, total=False):
    name: str
    unit: str
    price: str  # Decimal-compatible
    brand: str
    model_name: str
    tech_specs: dict


# ---------------------------------------------------------------------------
# КАТАЛОГ
# ---------------------------------------------------------------------------
# Поля: name обязательно; unit default "шт"; brand/model_name — пустые строки
# если не указаны; tech_specs — для диагностики / доп. инфы, matching их не
# использует напрямую (matching берёт model_name/brand отдельными полями).

MATERIALS: list[MaterialSpec] = [
    # --- Кабели -----------------------------------------------------------
    {"name": "Кабель ВВГнг(А)-LS 3x2.5", "unit": "м", "price": "92.00",
     "brand": "Рыбинсккабель", "tech_specs": {"class": "LS", "section": "3x2.5"}},
    {"name": "Кабель ВВГнг(А)-LS 3x1.5", "unit": "м", "price": "68.00",
     "brand": "Рыбинсккабель", "tech_specs": {"class": "LS", "section": "3x1.5"}},
    {"name": "Кабель ВВГнг(А)-LS 5x6", "unit": "м", "price": "285.00",
     "brand": "Рыбинсккабель", "tech_specs": {"class": "LS", "section": "5x6"}},
    {"name": "Кабель UTP 4x2x0.51 Cat.6", "unit": "м", "price": "48.00",
     "brand": "ExtraLink", "model_name": "Cat6-UTP",
     "tech_specs": {"category": "Cat.6", "shielded": False}},
    {"name": "Кабель FTP 4x2x0.51 Cat.6", "unit": "м", "price": "72.00",
     "brand": "ExtraLink", "model_name": "Cat6-FTP",
     "tech_specs": {"category": "Cat.6", "shielded": True}},

    # --- Воздуховоды прямоугольные ---------------------------------------
    {"name": "Воздуховод прямоугольный 100x100 (оцинк, 0.5мм)",
     "unit": "м.п.", "price": "680.00",
     "tech_specs": {"section": "100x100", "thickness_mm": 0.5}},
    {"name": "Воздуховод прямоугольный 200x100 (оцинк, 0.5мм)",
     "unit": "м.п.", "price": "850.00",
     "tech_specs": {"section": "200x100", "thickness_mm": 0.5}},
    {"name": "Воздуховод прямоугольный 200x200 (оцинк, 0.5мм)",
     "unit": "м.п.", "price": "1100.00",
     "tech_specs": {"section": "200x200", "thickness_mm": 0.5}},
    {"name": "Воздуховод прямоугольный 400x200 (оцинк, 0.7мм)",
     "unit": "м.п.", "price": "1650.00",
     "tech_specs": {"section": "400x200", "thickness_mm": 0.7}},
    {"name": "Воздуховод прямоугольный 500x250 (оцинк, 0.7мм)",
     "unit": "м.п.", "price": "2100.00",
     "tech_specs": {"section": "500x250", "thickness_mm": 0.7}},

    # --- Воздуховоды круглые ----------------------------------------------
    {"name": "Воздуховод круглый Ø100 (оцинк, спирально-навивной)",
     "unit": "м.п.", "price": "380.00", "tech_specs": {"diameter_mm": 100}},
    {"name": "Воздуховод круглый Ø125 (оцинк, спирально-навивной)",
     "unit": "м.п.", "price": "450.00", "tech_specs": {"diameter_mm": 125}},
    {"name": "Воздуховод круглый Ø160 (оцинк, спирально-навивной)",
     "unit": "м.п.", "price": "560.00", "tech_specs": {"diameter_mm": 160}},
    {"name": "Воздуховод круглый Ø200 (оцинк, спирально-навивной)",
     "unit": "м.п.", "price": "720.00", "tech_specs": {"diameter_mm": 200}},

    # --- Фасонные части воздуховодов --------------------------------------
    {"name": "Отвод прямоугольный 200x200 90°", "unit": "шт",
     "price": "1200.00", "tech_specs": {"section": "200x200", "angle_deg": 90}},
    {"name": "Тройник прямоугольный 200x200 / 200x100", "unit": "шт",
     "price": "1850.00"},
    {"name": "Переход прямоугольный 400x200 → 200x200", "unit": "шт",
     "price": "1650.00"},
    {"name": "Заглушка прямоугольная 200x200", "unit": "шт", "price": "420.00"},

    # --- Решётки / диффузоры ----------------------------------------------
    {"name": "Решётка вентиляционная АМН 200x200", "unit": "шт",
     "price": "1100.00", "brand": "Арктос", "model_name": "АМН-200",
     "tech_specs": {"section": "200x200"}},
    {"name": "Решётка вентиляционная АМН 400x200", "unit": "шт",
     "price": "1850.00", "brand": "Арктос", "model_name": "АМН-400",
     "tech_specs": {"section": "400x200"}},
    {"name": "Решётка АДН 300x150", "unit": "шт", "price": "1400.00",
     "brand": "Арктос", "model_name": "АДН-300"},
    {"name": "Диффузор потолочный ДПУ-М Ø200", "unit": "шт",
     "price": "1550.00", "brand": "Арктос", "model_name": "ДПУ-М-200",
     "tech_specs": {"diameter_mm": 200}},

    # --- Крепёж -----------------------------------------------------------
    {"name": "Подвес виброизолирующий для воздуховодов", "unit": "шт",
     "price": "180.00"},
    {"name": "Шпилька резьбовая М8 L=1000", "unit": "шт", "price": "95.00",
     "tech_specs": {"thread": "M8", "length_mm": 1000}},
    {"name": "Кронштейн настенный для наружного блока", "unit": "шт",
     "price": "1250.00"},
    {"name": "Гайка-барашек М8", "unit": "шт", "price": "22.00"},
    {"name": "Шайба М8 плоская оцинк.", "unit": "шт", "price": "4.50"},

    # --- Изоляция ---------------------------------------------------------
    {"name": "Изоляция K-FLEX ST 19мм (рулон)", "unit": "м²",
     "price": "850.00", "brand": "K-FLEX", "model_name": "ST-19",
     "tech_specs": {"thickness_mm": 19, "material": "вспененный каучук"}},
    {"name": "Изоляция K-FLEX ST 9мм (рулон)", "unit": "м²",
     "price": "520.00", "brand": "K-FLEX", "model_name": "ST-9",
     "tech_specs": {"thickness_mm": 9}},
    {"name": "Изоляция Energoflex Super 13мм (трубки Ø18)", "unit": "м",
     "price": "110.00", "brand": "Energoflex", "model_name": "Super-13-18"},
    {"name": "Утеплитель URSA GEO M-15 50мм", "unit": "м²",
     "price": "180.00", "brand": "URSA", "model_name": "GEO M-15",
     "tech_specs": {"thickness_mm": 50}},

    # --- Медная трасса кондиционеров --------------------------------------
    {"name": "Трасса медная 1/4\" + 3/8\" в изоляции",
     "unit": "м", "price": "420.00",
     "tech_specs": {"liquid": "1/4\"", "gas": "3/8\""}},
    {"name": "Трасса медная 1/4\" + 1/2\" в изоляции",
     "unit": "м", "price": "540.00",
     "tech_specs": {"liquid": "1/4\"", "gas": "1/2\""}},
    {"name": "Трасса медная 3/8\" + 5/8\" в изоляции",
     "unit": "м", "price": "720.00",
     "tech_specs": {"liquid": "3/8\"", "gas": "5/8\""}},

    # --- Монтажные элементы ----------------------------------------------
    {"name": "Хомут металлический червячный 80-100мм", "unit": "шт",
     "price": "95.00"},
    {"name": "Клемма WAGO 222-413 (3-контактная)", "unit": "шт",
     "price": "42.00", "brand": "WAGO", "model_name": "222-413"},
    {"name": "Гофра ПВХ Ø20мм (серая)", "unit": "м", "price": "38.00",
     "tech_specs": {"diameter_mm": 20, "material": "ПВХ"}},
    {"name": "Гофра ПВХ Ø25мм (серая)", "unit": "м", "price": "52.00",
     "tech_specs": {"diameter_mm": 25}},
    {"name": "Стяжка нейлоновая 300x4.8 (уп. 100шт)", "unit": "уп",
     "price": "280.00"},
    {"name": "Изолента ПВХ 19мм x 20м синяя", "unit": "шт", "price": "85.00"},

    # --- Прочее ОВиК (клапаны / шумоглушители) ---------------------------
    {"name": "Клапан обратный круглый Ø200", "unit": "шт",
     "price": "2800.00", "tech_specs": {"diameter_mm": 200}},
    {"name": "Клапан огнезадерживающий КЛОП-1 200x200", "unit": "шт",
     "price": "18500.00", "model_name": "КЛОП-1-200",
     "tech_specs": {"rating": "EI 60"}},
    {"name": "Шумоглушитель пластинчатый 500x250 L=600", "unit": "шт",
     "price": "8500.00", "tech_specs": {"section": "500x250", "length_mm": 600}},
    {"name": "Гибкая вставка прямоугольная 400x200", "unit": "шт",
     "price": "1950.00", "tech_specs": {"section": "400x200"}},
    {"name": "Фильтр воздушный G4 кассетный 600x600", "unit": "шт",
     "price": "1200.00", "tech_specs": {"section": "600x600", "class": "G4"}},
]


class Command(BaseCommand):
    help = (
        "Наполняет справочник Material для workspace «Август Климат» "
        "(~45 позиций ОВиК/СС: кабели, воздуховоды, решётки, изоляция, "
        "медь, крепёж). Идемпотентна — повторный запуск не создаёт дубли."
    )

    def handle(self, *args, **options):
        try:
            ws = Workspace.objects.get(id=WS_AVGUST_ID)
        except Workspace.DoesNotExist as exc:
            raise SystemExit(
                "Workspace «Август Климат» не найден. "
                "Сначала запусти `seed_dev_data` (make ismeta-seed)."
            ) from exc

        created = 0
        updated = 0
        total = len(MATERIALS)

        for spec in MATERIALS:
            name = spec["name"]
            model_name = spec.get("model_name", "") or ""
            brand = spec.get("brand", "") or ""

            defaults = {
                "unit": spec.get("unit", "шт"),
                "price": Decimal(spec["price"]),
                "tech_specs": spec.get("tech_specs", {}) or {},
                "is_active": True,
            }

            obj, was_created = Material.objects.get_or_create(
                workspace=ws,
                name=name,
                model_name=model_name,
                brand=brand,
                defaults=defaults,
            )
            if was_created:
                created += 1
            else:
                # Обновим price / unit / tech_specs — справочник может расти.
                dirty = False
                for field, val in defaults.items():
                    if getattr(obj, field) != val:
                        setattr(obj, field, val)
                        dirty = True
                if dirty:
                    obj.save(update_fields=list(defaults.keys()))
                    updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"  Material каталог: всего={total}, "
                f"создано={created}, обновлено={updated}, "
                f"workspace={ws.name}"
            )
        )
