"""Management command: seed_dev_data — dev workspace + реалистичные демо-сметы.

Создаёт набор смет ОВиК/СС с заполненными brand/model_name/tech_specs,
разнообразными треками оборудования и procurement статусами — для демо
полного цикла ISMeta (UI-02 brand/model, procurement summary, matching,
резины и т.д.).

UUIDs зафиксированы в .env.example (WORKSPACE_DEV_SEED_UUIDS).
Идемпотентна: при повторном запуске — обновляет workspaces, пропускает
существующие сметы (создание всех items заново ломает order в partitioned
table). Для полного пересоздания — `make ismeta-db-reset`.
"""

import uuid

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import connection, transaction

from apps.estimate.matching.knowledge import ProductKnowledge
from apps.estimate.models import Estimate, EstimateSection
from apps.estimate.services.markup_service import (
    recalc_estimate_totals,
    recalc_item_totals,
)
from apps.workspace.models import MemberRole, Workspace, WorkspaceMember

User = get_user_model()

WS_AVGUST_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")

SEED_WORKSPACES = [
    {"id": WS_AVGUST_ID, "name": "Август Климат", "slug": "avgust-klimat"},
    {
        "id": uuid.UUID("22222222-2222-2222-2222-222222222222"),
        "name": "Тестовая Компания",
        "slug": "test-company",
    },
]


# =============================================================================
# ГЛАВНАЯ ДЕМО-СМЕТА: офис 2000 м² — вентиляция, кондиционирование, СС.
# =============================================================================
#
# Формат item:
#   name       — строка позиции
#   unit       — ед. измерения
#   qty        — количество
#   eq_price   — цена оборудования (руб) — ненулевое для key_equipment и прочего обор.
#   mat_price  — цена материала (руб)
#   key        — is_key_equipment (основное оборудование)
#   proc       — procurement_status (none/requested/quoted/booked/ordered)
#   brand      — производитель (для UI-02 подстроки)
#   model      — model_name (для UI-02 подстроки)
#   specs      — дополнительные tech_specs (flow, power, cooling, ...)
#
# Разнообразие:
#   - brand + model (3-5 шт) — UI-02 «·»-подстрока
#   - только brand (2-3 шт)
#   - только model (2-3 шт)
#   - без brand/model (3-5 шт) — UI-02 без подстроки
#   - key=True + разные proc-статусы
MAIN_ITEMS = {
    "Вентиляция": [
        # TD-04: первые 6 items покрывают варианты tech_specs для ручной UI-проверки
        # (UI-02 brand/model, UI-04 model+comments, inline-edit, tooltips) — не удалять.
        # Вариант 1: brand + model + произвольный ключ (flow).
        {"name": "Вентилятор канальный WNK 100/1", "unit": "шт", "qty": 2,
         "eq_price": 18500, "key": True, "proc": "quoted",
         "brand": "Korf", "model": "WNK 100/1",
         "specs": {"flow": "2600 м³/ч"}},
        # Вариант 2: только model (brand отсутствует).
        {"name": "Вентилятор крышный MOB2600/45-3a", "unit": "шт", "qty": 1,
         "eq_price": 145000, "key": True, "proc": "requested",
         "model": "MOB 2600/45-3a"},
        # Вариант 3: только brand.
        {"name": "Воздуховод прямоугольный 200×100 мм", "unit": "м.п.", "qty": 46,
         "mat_price": 460,
         "brand": "ExtraLink"},
        # Вариант 4: manufacturer + comments + system (без brand/model).
        {"name": "Воздуховод прямоугольный 400×200 мм", "unit": "м.п.", "qty": 32,
         "mat_price": 820,
         "specs": {"manufacturer": "АО «ДКС»", "comments": "+10%", "system": "ПДВ"}},
        # Вариант 5: пустой tech_specs (negative control для tooltip/inline-edit).
        {"name": "Решётка АМН 200×200", "unit": "шт", "qty": 12,
         "mat_price": 1250},
        # Вариант 6: brand + model + power_kw + class (полный tech_specs tooltip).
        {"name": "Диффузор потолочный ДПУ-С", "unit": "шт", "qty": 8,
         "mat_price": 1800,
         "brand": "Арктика", "model": "ДПУ-С",
         "specs": {"power_kw": "7.5", "class": "EI60"}},
        # без brand/model
        {"name": "Клапан огнезадерживающий КПУ-1М Ø250", "unit": "шт", "qty": 4,
         "eq_price": 12400, "key": False, "proc": "none",
         "specs": {"diameter": "250", "fire_class": "EI 60"}},
        # brand+model
        {"name": "Шумоглушитель канальный SAR 400×200", "unit": "шт", "qty": 2,
         "eq_price": 14800,
         "brand": "Shuft", "model": "SAR 400×200-600",
         "specs": {"section": "400×200", "length": "600 мм"}},
        # без brand/model (расходник)
        {"name": "Гибкая вставка Ø250", "unit": "шт", "qty": 6,
         "mat_price": 780},
        # brand+model, key
        {"name": "Приточно-вытяжная установка Systemair SAVE VTR 500", "unit": "шт", "qty": 1,
         "eq_price": 420000, "key": True, "proc": "requested",
         "brand": "Systemair", "model": "SAVE VTR 500",
         "specs": {"flow": "500 м³/ч", "recovery": "85%", "class": "роторный"}},
    ],
    "Кондиционирование": [
        # brand+model+specs, key, booked
        {"name": "Кондиционер сплит-система Daikin RQ-71BV", "unit": "шт", "qty": 6,
         "eq_price": 145000, "key": True, "proc": "booked",
         "brand": "Daikin", "model": "RQ-71BV",
         "specs": {"cooling": "7.1 кВт", "heating": "8.0 кВт", "class": "инверторный"}},
        # только model
        {"name": "Внутренний блок настенный RQ-71BV", "unit": "шт", "qty": 6,
         "eq_price": 52000, "key": True, "proc": "booked",
         "model": "FTXR71BV"},
        # brand+model, key, ordered
        {"name": "VRF-система внутренний блок Mitsubishi PLFY", "unit": "шт", "qty": 4,
         "eq_price": 98000, "key": True, "proc": "ordered",
         "brand": "Mitsubishi Electric", "model": "PLFY-P63VBM-E",
         "specs": {"cooling": "6.3 кВт", "type": "кассетный 4-поток"}},
        # без brand/model (расходник)
        {"name": "Трасса медная 1/4\"+3/8\"", "unit": "м.п.", "qty": 85,
         "mat_price": 880,
         "specs": {"sizes": "1/4+3/8", "insulation": "9 мм"}},
        # без brand/model
        {"name": "Кабель управления 4×0.75 мм²", "unit": "м", "qty": 85,
         "mat_price": 95},
        # только brand
        {"name": "Кронштейн для наружного блока усиленный", "unit": "шт", "qty": 6,
         "mat_price": 2400,
         "brand": "Холодок"},
        # без brand/model
        {"name": "Дренажная помпа для кондиционера 10 л/ч", "unit": "шт", "qty": 6,
         "eq_price": 3200},
        # только brand
        {"name": "Теплоизоляция для медной трассы 9 мм", "unit": "м", "qty": 85,
         "mat_price": 140,
         "brand": "K-Flex"},
        # brand+model, key, none
        {"name": "Фанкойл канальный Mitsubishi PEFY", "unit": "шт", "qty": 2,
         "eq_price": 88000, "key": True, "proc": "none",
         "brand": "Mitsubishi Electric", "model": "PEFY-P40VMA-E",
         "specs": {"cooling": "4.0 кВт"}},
    ],
    "Слаботочные системы (СС)": [
        # только brand (частый кейс — марка известна, модель нет)
        {"name": "Кабель UTP 4x2x0.52 Cat.6", "unit": "м", "qty": 420,
         "mat_price": 48,
         "brand": "ExtraLink",
         "specs": {"class": "Cat.6", "shield": "UTP"}},
        # brand+model
        {"name": "Коммутатор управляемый TP-Link T1600G-28TS", "unit": "шт", "qty": 2,
         "eq_price": 32000, "key": True, "proc": "quoted",
         "brand": "TP-Link", "model": "T1600G-28TS",
         "specs": {"ports": "24+4 SFP", "type": "L2+"}},
        # brand+model
        {"name": "IP-камера купольная HiWatch DS-I250", "unit": "шт", "qty": 12,
         "eq_price": 8500, "key": False, "proc": "quoted",
         "brand": "HiWatch", "model": "DS-I250",
         "specs": {"resolution": "2 МП", "lens": "2.8 мм"}},
        # только model
        {"name": "Видеорегистратор 16-канальный NVR-216M", "unit": "шт", "qty": 1,
         "eq_price": 42000, "key": True, "proc": "requested",
         "model": "NVR-216M-K/16P"},
        # без brand/model
        {"name": "Датчик дыма автономный ИП-212-69/3М", "unit": "шт", "qty": 24,
         "eq_price": 680, "key": False, "proc": "none",
         "specs": {"type": "оптический", "battery": "9V"}},
        # без brand/model
        {"name": "Извещатель пожарный ручной ИПР-3СУМ", "unit": "шт", "qty": 6,
         "eq_price": 420, "key": False, "proc": "none"},
        # brand+model
        {"name": "Контроллер СКУД Parsec NC-1000M-IP", "unit": "шт", "qty": 1,
         "eq_price": 28500, "key": True, "proc": "requested",
         "brand": "Parsec", "model": "NC-1000M-IP"},
        # только brand
        {"name": "Считыватель карт EM-Marine", "unit": "шт", "qty": 4,
         "eq_price": 3200,
         "brand": "Parsec"},
        # без brand/model
        {"name": "Патч-корд UTP Cat.6 1 м", "unit": "шт", "qty": 60,
         "mat_price": 180},
        # без brand/model
        {"name": "Розетка RJ-45 Cat.6 угловая", "unit": "шт", "qty": 48,
         "mat_price": 310},
        # только model
        {"name": "Источник бесперебойного питания Smart-UPS 1500VA", "unit": "шт", "qty": 1,
         "eq_price": 58000, "key": True, "proc": "booked",
         "model": "SMT1500RMI2U"},
        # без brand/model
        {"name": "Шкаф телекоммуникационный 19\" 12U напольный", "unit": "шт", "qty": 1,
         "eq_price": 32000, "key": False, "proc": "quoted"},
        # brand
        {"name": "Оповещатель пожарный светозвуковой", "unit": "шт", "qty": 8,
         "eq_price": 780,
         "brand": "Рубеж"},
    ],
}


# =============================================================================
# ДОПОЛНИТЕЛЬНАЯ СМЕТА #1: ремонт вентиляции 500 м² — средняя, 10 позиций.
# =============================================================================
VENT_REPAIR_ITEMS = {
    "Вентиляция": [
        {"name": "Демонтаж существующего вентилятора", "unit": "шт", "qty": 2,
         "mat_price": 0},
        {"name": "Вентилятор канальный WNK 125/1", "unit": "шт", "qty": 2,
         "eq_price": 22000, "key": True, "proc": "quoted",
         "brand": "Korf", "model": "WNK 125/1",
         "specs": {"flow": "750 м³/ч"}},
        {"name": "Замена гибких вставок", "unit": "шт", "qty": 4,
         "mat_price": 720},
        {"name": "Воздуховод круглый Ø200 спираль", "unit": "м.п.", "qty": 28,
         "mat_price": 520,
         "specs": {"diameter": "200"}},
        {"name": "Решётка вентиляционная алюминиевая", "unit": "шт", "qty": 8,
         "mat_price": 950,
         "brand": "Арктос"},
        {"name": "Клапан обратный Ø200", "unit": "шт", "qty": 2,
         "mat_price": 1450},
        {"name": "Монтажная лента перфорированная", "unit": "м", "qty": 40,
         "mat_price": 85},
        {"name": "Шпилька резьбовая М8 1 м", "unit": "шт", "qty": 24,
         "mat_price": 120},
        {"name": "Фильтр карманный G4 для приточной камеры", "unit": "шт", "qty": 4,
         "mat_price": 2200,
         "specs": {"class": "G4"}},
        {"name": "Шумоглушитель Ø200 L=500", "unit": "шт", "qty": 2,
         "mat_price": 3400,
         "brand": "Shuft"},
    ],
}


# =============================================================================
# ДОПОЛНИТЕЛЬНАЯ СМЕТА #2: VRF-система — только оборудование, 5 позиций.
# =============================================================================
VRF_ITEMS = {
    "VRF-система": [
        {"name": "VRF наружный блок Daikin RXYQ10U", "unit": "шт", "qty": 1,
         "eq_price": 680000, "key": True, "proc": "requested",
         "brand": "Daikin", "model": "RXYQ10U",
         "specs": {"cooling": "28 кВт", "heating": "31.5 кВт"}},
        {"name": "VRF внутренний блок кассетный FXFQ63B", "unit": "шт", "qty": 4,
         "eq_price": 118000, "key": True, "proc": "quoted",
         "brand": "Daikin", "model": "FXFQ63B",
         "specs": {"cooling": "7.1 кВт", "type": "кассетный 4-поток"}},
        {"name": "VRF внутренний блок канальный FXSQ32B", "unit": "шт", "qty": 2,
         "eq_price": 92000, "key": True, "proc": "quoted",
         "brand": "Daikin", "model": "FXSQ32B",
         "specs": {"cooling": "3.6 кВт", "type": "канальный"}},
        {"name": "Пульт управления BRC1E53C беспроводной", "unit": "шт", "qty": 6,
         "eq_price": 12500,
         "brand": "Daikin", "model": "BRC1E53C"},
        {"name": "Рефнет-разветвитель KHRQ22M20T", "unit": "шт", "qty": 3,
         "eq_price": 18500,
         "brand": "Daikin", "model": "KHRQ22M20T"},
    ],
}


# =============================================================================
# Вспомогательные функции
# =============================================================================

def _insert_item(cur, *, section, estimate, workspace_id, sort_order, data):
    """Вставить одну строку EstimateItem через raw SQL (partitioned table)."""
    tech_specs = dict(data.get("specs") or {})
    if data.get("brand"):
        tech_specs["brand"] = data["brand"]
    if data.get("model"):
        tech_specs["model_name"] = data["model"]

    item_data = {
        "quantity": data.get("qty", 1),
        "equipment_price": data.get("eq_price", 0),
        "material_price": data.get("mat_price", 0),
        "work_price": data.get("work_price", 0),
        "material_markup": None,
        "work_markup": None,
    }
    totals = recalc_item_totals(item_data, section, estimate)

    import json
    cur.execute(
        """
        INSERT INTO estimate_item (
            id, section_id, estimate_id, workspace_id, row_id,
            sort_order, name, unit, quantity,
            equipment_price, material_price, work_price,
            equipment_total, material_total, work_total, total,
            version, match_source,
            material_markup, work_markup, tech_specs, custom_data,
            is_deleted, is_key_equipment, procurement_status, man_hours,
            created_at, updated_at
        ) VALUES (
            gen_random_uuid(), %s, %s, %s, gen_random_uuid(),
            %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s, %s, %s,
            1, 'unmatched',
            NULL, NULL, %s::jsonb, '{}'::jsonb,
            FALSE, %s, %s, 0,
            NOW(), NOW()
        )
        """,
        [
            section.id, estimate.id, workspace_id,
            sort_order, data["name"], data.get("unit", "шт"), item_data["quantity"],
            item_data["equipment_price"], item_data["material_price"], item_data["work_price"],
            totals["equipment_total"], totals["material_total"], totals["work_total"], totals["total"],
            json.dumps(tech_specs, ensure_ascii=False),
            bool(data.get("key", False)),
            data.get("proc", "none"),
        ],
    )


def _seed_estimate(
    *,
    workspace,
    name: str,
    folder_name: str,
    sections_with_items: dict,
    created_by,
    stdout,
    style,
    material_markup=None,
    work_markup=None,
):
    """Создать одну смету с разделами и строками. Идемпотентно."""
    defaults = {
        "folder_name": folder_name,
        "default_material_markup": material_markup or {"type": "percent", "value": 30},
        "default_work_markup": work_markup or {"type": "percent", "value": 300},
        "created_by": created_by,
    }
    estimate, created = Estimate.objects.get_or_create(
        workspace=workspace, name=name, defaults=defaults
    )
    if not created:
        stdout.write(f"  • Смета «{name}» уже существует — пропуск.")
        return estimate

    stdout.write(style.SUCCESS(f"  • Создана смета «{name}»"))

    with transaction.atomic():
        sort_order = 0
        for idx, (section_name, items) in enumerate(sections_with_items.items()):
            section, _ = EstimateSection.objects.get_or_create(
                estimate=estimate, workspace=workspace,
                name=section_name, defaults={"sort_order": idx},
            )

            with connection.cursor() as cur:
                for data in items:
                    sort_order += 1
                    _insert_item(
                        cur,
                        section=section, estimate=estimate,
                        workspace_id=workspace.id,
                        sort_order=sort_order, data=data,
                    )

            stdout.write(f"      — {section_name}: {len(items)} позиций")

        recalc_estimate_totals(estimate.id, workspace.id)

    return estimate


# =============================================================================
# Команда
# =============================================================================

class Command(BaseCommand):
    help = (
        "Создаёт dev workspace + демо-сметы ОВиК/СС (идемпотентно). "
        "Главная смета — 3 раздела, 25+ позиций с заполненными brand/model_name."
    )

    def handle(self, *args, **options):
        admin_user, created = User.objects.get_or_create(
            username="admin",
            defaults={"is_staff": True, "is_superuser": True},
        )
        if created:
            admin_user.set_password("admin")
            admin_user.save()
            self.stdout.write(self.style.SUCCESS("  Создан суперпользователь admin/admin"))

        for ws_data in SEED_WORKSPACES:
            ws, ws_created = Workspace.objects.update_or_create(
                id=ws_data["id"],
                defaults={"name": ws_data["name"], "slug": ws_data["slug"]},
            )
            verb = "Создан" if ws_created else "Обновлён"
            self.stdout.write(self.style.SUCCESS(f"  {verb} workspace: {ws.name} ({ws.id})"))
            WorkspaceMember.objects.get_or_create(
                workspace=ws, user=admin_user, defaults={"role": MemberRole.OWNER}
            )

        ws_avg = Workspace.objects.get(id=WS_AVGUST_ID)

        # Главная демо-смета — полный цикл ОВиК.
        _seed_estimate(
            workspace=ws_avg,
            name="Смета демо — монтаж ОВиК офисного здания 2000 м²",
            folder_name="БЦ «Спиридонов» — новый монтаж",
            sections_with_items=MAIN_ITEMS,
            created_by=admin_user,
            stdout=self.stdout,
            style=self.style,
        )

        # Дополнительные — для демо списка смет / переключения между сметами.
        _seed_estimate(
            workspace=ws_avg,
            name="Смета — ремонт вентиляции 500 м²",
            folder_name="Офис на Мясницкой — реконструкция",
            sections_with_items=VENT_REPAIR_ITEMS,
            created_by=admin_user,
            stdout=self.stdout,
            style=self.style,
        )

        _seed_estimate(
            workspace=ws_avg,
            name="Смета — монтаж VRF-системы",
            folder_name="Шоурум «Лето» — новый объект",
            sections_with_items=VRF_ITEMS,
            created_by=admin_user,
            stdout=self.stdout,
            style=self.style,
        )

        # ProductKnowledge rules (E5.1) — 50 правил по 4 категориям.
        # Цены — монтаж (work_price) на ОВиК/СС рынке РФ, март 2026.
        knowledge_rules = [
            # --- Вентиляция (15) ---
            {"pattern": "воздуховод+прямоугольный", "work_name": "Монтаж воздуховода прямоуг.", "unit": "м.п.", "price": 800},
            {"pattern": "воздуховод+круглый", "work_name": "Монтаж воздуховода круглого", "unit": "м.п.", "price": 600},
            {"pattern": "вентилятор+крышный", "work_name": "Монтаж вентилятора крышного", "unit": "шт", "price": 12000},
            {"pattern": "вентилятор+канальный", "work_name": "Монтаж вентилятора канального", "unit": "шт", "price": 8500},
            {"pattern": "вентилятор+осевой", "work_name": "Монтаж вентилятора осевого", "unit": "шт", "price": 6000},
            {"pattern": "клапан+огнезадерживающий", "work_name": "Монтаж огнезадерж. клапана", "unit": "шт", "price": 3500},
            {"pattern": "клапан+обратный", "work_name": "Монтаж клапана обратного", "unit": "шт", "price": 1800},
            {"pattern": "решётка+вентиляционная", "work_name": "Установка решётки вент.", "unit": "шт", "price": 500},
            {"pattern": "диффузор", "work_name": "Установка диффузора", "unit": "шт", "price": 600},
            {"pattern": "шумоглушитель", "work_name": "Монтаж шумоглушителя", "unit": "шт", "price": 2200},
            {"pattern": "фильтр+воздушный", "work_name": "Установка воздушного фильтра", "unit": "шт", "price": 900},
            {"pattern": "калорифер", "work_name": "Монтаж калорифера", "unit": "шт", "price": 5500},
            {"pattern": "рекуператор", "work_name": "Монтаж рекуператора", "unit": "шт", "price": 18000},
            {"pattern": "гибкая+вставка", "work_name": "Монтаж гибкой вставки", "unit": "шт", "price": 700},
            {"pattern": "заслонка+регулирующая", "work_name": "Монтаж регулирующей заслонки", "unit": "шт", "price": 2500},

            # --- Кондиционирование (10) ---
            {"pattern": "сплит+система", "work_name": "Монтаж сплит-системы", "unit": "шт", "price": 12000},
            {"pattern": "мульти+сплит", "work_name": "Монтаж мульти-сплит системы", "unit": "шт", "price": 25000},
            {"pattern": "кондиционер+кассетный", "work_name": "Монтаж кассетного кондиционера", "unit": "шт", "price": 18000},
            {"pattern": "кондиционер+канальный", "work_name": "Монтаж канального кондиционера", "unit": "шт", "price": 22000},
            {"pattern": "кондиционер+колонный", "work_name": "Монтаж колонного кондиционера", "unit": "шт", "price": 16000},
            {"pattern": "чиллер", "work_name": "Монтаж чиллера", "unit": "шт", "price": 80000},
            {"pattern": "фанкойл", "work_name": "Монтаж фанкойла", "unit": "шт", "price": 9500},
            {"pattern": "vrf", "work_name": "Монтаж внутреннего блока VRF", "unit": "шт", "price": 22000},
            {"pattern": "дренажная+помпа", "work_name": "Установка дренажной помпы", "unit": "шт", "price": 3500},
            {"pattern": "фреонопровод", "work_name": "Прокладка фреонопровода", "unit": "м.п.", "price": 1200},

            # --- Слаботочные системы (15) ---
            {"pattern": "кабель+utp", "work_name": "Прокладка кабеля UTP", "unit": "м", "price": 150},
            {"pattern": "кабель+ftp", "work_name": "Прокладка кабеля FTP", "unit": "м", "price": 180},
            {"pattern": "кабель+оптический", "work_name": "Прокладка оптического кабеля", "unit": "м", "price": 250},
            {"pattern": "кабель+коаксиальный", "work_name": "Прокладка коаксиального кабеля", "unit": "м", "price": 130},
            {"pattern": "камера+видеонаблюдение", "work_name": "Монтаж IP-камеры", "unit": "шт", "price": 1200},
            {"pattern": "видеорегистратор", "work_name": "Установка видеорегистратора", "unit": "шт", "price": 3000},
            {"pattern": "коммутатор", "work_name": "Монтаж коммутатора", "unit": "шт", "price": 2500},
            {"pattern": "ибп", "work_name": "Установка ИБП", "unit": "шт", "price": 2000},
            {"pattern": "датчик+дым", "work_name": "Монтаж датчика дыма", "unit": "шт", "price": 350},
            {"pattern": "датчик+движения", "work_name": "Монтаж датчика движения", "unit": "шт", "price": 400},
            {"pattern": "датчик+протечки", "work_name": "Монтаж датчика протечки", "unit": "шт", "price": 450},
            {"pattern": "считыватель+скуд", "work_name": "Монтаж считывателя СКУД", "unit": "шт", "price": 1500},
            {"pattern": "контроллер+скуд", "work_name": "Монтаж контроллера СКУД", "unit": "шт", "price": 3500},
            {"pattern": "извещатель+пожарный", "work_name": "Монтаж пожарного извещателя", "unit": "шт", "price": 450},
            {"pattern": "оповещатель+пожарный", "work_name": "Монтаж пожарного оповещателя", "unit": "шт", "price": 800},

            # --- Автоматика (10) ---
            {"pattern": "контроллер+ddc", "work_name": "Монтаж контроллера DDC", "unit": "шт", "price": 8500},
            {"pattern": "привод+клапана", "work_name": "Монтаж привода клапана", "unit": "шт", "price": 3200},
            {"pattern": "датчик+температуры", "work_name": "Монтаж датчика температуры", "unit": "шт", "price": 900},
            {"pattern": "датчик+давления", "work_name": "Монтаж датчика давления", "unit": "шт", "price": 1100},
            {"pattern": "датчик+co2", "work_name": "Монтаж датчика CO2", "unit": "шт", "price": 1600},
            {"pattern": "термостат", "work_name": "Установка термостата", "unit": "шт", "price": 1400},
            {"pattern": "частотный+преобразователь", "work_name": "Монтаж частотного преобразователя", "unit": "шт", "price": 6500},
            {"pattern": "щит+автоматики", "work_name": "Монтаж щита автоматики", "unit": "шт", "price": 28000},
            {"pattern": "панель+оператора", "work_name": "Монтаж панели оператора", "unit": "шт", "price": 4500},
            {"pattern": "модуль+ввода-вывода", "work_name": "Монтаж модуля I/O", "unit": "шт", "price": 2800},
        ]
        pk_created = 0
        for rule in knowledge_rules:
            _, pk_was_created = ProductKnowledge.objects.get_or_create(
                workspace_id=ws_avg.id,
                pattern=rule["pattern"],
                defaults={"work_name": rule["work_name"], "work_unit": rule["unit"], "work_price": rule["price"]},
            )
            if pk_was_created:
                pk_created += 1
        if pk_created:
            self.stdout.write(self.style.SUCCESS(f"  Создано {pk_created} правил ProductKnowledge"))

        # Material catalog (E-MAT-SEED-01) — отдельная команда, тоже идемпотентна.
        from django.core.management import call_command
        call_command("seed_materials", stdout=self.stdout, stderr=self.stderr)

        self.stdout.write(self.style.SUCCESS(f"\nSeed завершён: {len(SEED_WORKSPACES)} workspace."))
