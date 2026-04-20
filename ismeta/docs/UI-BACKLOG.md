# UI Backlog — замечания для исправления

## Высокий приоритет

### 1. Resizable sections panel
- Sidebar разделов (w-64 = 256px) — слишком узкий для длинных названий
- Нужно: drag-handle на правой границе, resize мышкой
- Состояние ширины сохранять в localStorage
- Библиотека: react-resizable-panels или кастомный resize через onMouseDown/Move/Up

## Средний приоритет

### 3. Footer items-table переносится при широком sidebar
- Найдено в UI-03 ручной верификации.
- Повтор: `/estimates/{id}`, sidebar разделов растянут до 600px, ширина окна 1400px.
- Симптом: footer («Оборудование / Материалы / Работы / Итого») упирается в правый край, лейбл и значение переносятся на разные строки («Оборудование:» / «0,00 ₽»).
- Причины: неадаптивный `flex items-center justify-end gap-6` без flex-wrap + фиксированные суммы.
- Варианты фикса: `flex-wrap` + уменьшить gap; либо горизонтальный scroll контейнер таблицы; либо сворачивать лейблы в «Обор./Мат./Раб.» при ширине ниже порога.
- Не блокер — на 1280+ width с sidebar 256–400px проблема не воспроизводится.

### 2. Разделение name / model / manufacturer
- Сейчас: всё в одном поле `name` = "Вентилятор канальный WNK 100/1 Корф"
- Нужно: `name` = "Вентилятор канальный", `tech_specs.model` = "WNK 100/1", `tech_specs.manufacturer` = "Корф"
- Модель данных готова (tech_specs JSONB с Pydantic TechSpecs: model, manufacturer)
- SpecificationParser уже возвращает name/model/brand раздельно
- Что доделать:
  - PDF import: писать model/brand в tech_specs (сейчас конкатенирует в name)
  - Excel import: маппинг столбца "Модель"/"Марка"/"Артикул" → tech_specs.model
  - Matching grouping: нормализация убирает модель из name перед сравнением
  - UI: отображение model отдельно (tooltip или доп. столбец)
- Не требует миграции — tech_specs уже существует

## Записано
- 2026-04-20: resizable sections panel (Андрей)
- 2026-04-20: разделение name/model/manufacturer (Андрей)
- 2026-04-20: B2 footer items-table responsive (UI-03 review, Федя)
