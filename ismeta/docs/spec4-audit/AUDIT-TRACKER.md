# Spec-4 Audit Tracker — Полный обход 87 листов

**PDF:** `/Users/andrei_prygunov/Downloads/Спорт-школа КЛИН/Проекты/Альбом СК-269-7-22-ОВ2 (ВЕНТ) ИЗМ3.1_СПЕЦИФИКАЦИЯ.pdf`
**Job:** `0f82c23d-7817-4fdd-b85c-4a5020d54b31` (DB recognition_jobs_recognitionjob)
**DB items:** 1317 / **PO ручной count:** 1250 → расхождение **+67**
**Started:** 2026-04-26
**Process:** медленно, последовательно, по 1 листу. На каждом — выявить ВСЕ проблемы (count + quality). После 87 листов — классифицировать → fix sprint.

## PO ручной count per page

```
1:10  2:15  3:15  4:22  5:15  6:19  7:15  8:16  9:16  10:13
11:23 12:14 13:17 14:16 15:23 16:14 17:20 18:12 19:14 20:20
21:15 22:21 23:11 24:18 25:19 26:18 27:13 28:17 29:15 30:15
31:16 32:12 33:15 34:16 35:11 36:12 37:14 38:14 39:15 40:15
41:11 42:12 43:17 44:14 45:14 46:16 47:19 48:14 49:17 50:14
51:11 52:13 53:17 54:15 55:12 56:12 57:12 58:12 59:12 60:12
61:11 62:11 63:13 64:11 65:10 66:12 67:13 68:11 69:11 70:12
71:11 72:11 73:11 74:12 75:11 76:10 77:12 78:12 79:11 80:12
81:11 82:11 83:14 84:17 85:21 86:24 87:17
```

## Известные предварительные классы ошибок (из первого прогона compare)

| # | Класс | Описание | Пример (страница) |
|---|---|---|---|
| A | TOZHE_NOT_INHERITED | «То же» не наследует parent name | многие, иногда уже работает |
| B | CROSS_MERGE | continuation от item N приклеилось к item N-1 (по PO: #23 ← #24, #24 ← #25) | стр 1-10 |
| C | DUP_CONTINUATION_IN_NAME | «в комплекте. в комплекте.» | стр 10, 16, 18, 23, ~10 страниц |
| D | MISSING_ITEM | LLM пропустила row | стр 73 (-1) |
| E | **MULTI_LINE_MODEL_SPLIT** ★ | модель в PDF на 2-3 визуальные строки → 2-3 items | стр 83 (+20!), 76 |
| F | MULTI_LINE_NAME_AS_ITEM | continuation name (типа "(НО), привод клапана снаружи") стал отдельным item | стр 15, 20, 26 |
| G | TRAILING_HYPHEN | word-break не закрыт continuation | ~40 страниц |

★ — предположительно главный вклад в +67 (страница 83 одна даёт +20 из-за 11 «Смесительных узлов» × 3 row на каждый).

## Worst pages (count delta)

| Page | PO | DB | Δ |
|---|---|---|---|
| 83 | 14 | 34 | **+20** |
| 15 | 23 | 31 | +8 |
| 20 | 20 | 26 | +6 |
| 76 | 10 | 16 | +6 |
| 26 | 18 | 23 | +5 |
| 8 | 16 | 20 | +4 |
| 7 | 15 | 18 | +3 |
| 28 | 17 | 20 | +3 |
| 50 | 14 | 16 | +2 |
| 62 | 11 | 13 | +2 |
| 19 | 14 | 16 | +2 |
| 73 | 11 | **10** | **−1** ← пропуск |
| остальные | | | +1 |

## Лог обхода (заполняется по мере)

### Лист 1 (PO=10, DB=10, Δ=0)

Status: ⏳ pending

### Лист 2 (PO=15, DB=15, Δ=0)

Status: ⏳ pending

<!-- Шаблон для каждого листа:
### Лист N (PO=X, DB=Y, Δ=Z)

**PNG:** `/tmp/spec4-pages/page_NNN.png` (генерируется по запросу)
**Items в DB:** см. SQL ниже

**Что в PDF реально:**
1. ...
2. ...

**Что в DB:**
1. ...
2. ...

**Проблемы:**
- [ ] Class X: описание (item #2 в DB)
- [ ] ...

**Status:** ✓ done / ⚠ partial / ⏳ pending
-->

## Команды

### Получить items по странице из DB

```bash
docker compose -f /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust/ismeta/docker-compose.yml exec -T postgres psql -U ismeta -d ismeta -c "
SELECT (i->>'sort_order')::int AS pos, i->>'name' AS name, i->>'model_name' AS model, i->>'quantity' AS qty, i->>'unit' AS unit, i->>'manufacturer' AS mfr
FROM recognition_jobs_recognitionjob, jsonb_array_elements(items) i
WHERE id='0f82c23d-7817-4fdd-b85c-4a5020d54b31' AND (i->>'page_number')::int = N
ORDER BY (i->>'sort_order')::int;"
```

### Сгенерить PNG страницы

```bash
docker compose -f /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust/ismeta/docker-compose.yml exec -T recognition python -c "
import fitz
doc = fitz.open('/tmp/sport.pdf')
doc[N-1].get_pixmap(dpi=150).save('/tmp/pages/page_NNN.png')
"
docker cp ismeta-recognition:/tmp/pages/page_NNN.png /tmp/spec4-pages/
```

### Извлечь bbox rows страницы

```bash
docker compose -f /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust/ismeta/docker-compose.yml exec -T recognition python -c "
import fitz
from app.services.pdf_text import extract_structured_rows
doc = fitz.open('/tmp/sport.pdf')
for r in extract_structured_rows(doc[N-1]):
    print(r.cells)
"
```

## Правила обхода

1. **По одному листу за раз.** Не торопиться.
2. На каждом — открыть PNG (визуально) + DB items + PDF bbox если нужно.
3. Записать ВСЕ найденные проблемы (даже мелкие) с указанием класса.
4. Если новый класс ошибки — добавить в таблицу выше.
5. После 10 листов — **commit** прогресса в этот файл.
6. После всех 87 — **финальный анализ**: топ классов по влиянию, план fix sprint.

## После compact — старт с первого листа

См. стартовый промпт в `START-PROMPT.md`.
