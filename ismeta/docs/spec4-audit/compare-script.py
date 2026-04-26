"""Compare PDF Spec-4 (87 pages) vs DB recognition_jobs items.

PO предоставил точное число позиций per page. Этот скрипт:
1. Группирует items из job.items по page_number
2. Сравнивает count per page с PO_COUNTS
3. Помечает items с подозрительными признаками (двойной continuation,
   дубль подряд, длинный model_name, «То же» без parent)
4. Выводит markdown отчёт
"""
import json
import re
import psycopg2

# PO ручной подсчёт per page
PO_COUNTS = {
    1: 10, 2: 15, 3: 15, 4: 22, 5: 15, 6: 19, 7: 15, 8: 16, 9: 16, 10: 13,
    11: 23, 12: 14, 13: 17, 14: 16, 15: 23, 16: 14, 17: 20, 18: 12, 19: 14, 20: 20,
    21: 15, 22: 21, 23: 11, 24: 18, 25: 19, 26: 18, 27: 13, 28: 17, 29: 15, 30: 15,
    31: 16, 32: 12, 33: 15, 34: 16, 35: 11, 36: 12, 37: 14, 38: 14, 39: 15, 40: 15,
    41: 11, 42: 12, 43: 17, 44: 14, 45: 14, 46: 16, 47: 19, 48: 14, 49: 17, 50: 14,
    51: 11, 52: 13, 53: 17, 54: 15, 55: 12, 56: 12, 57: 12, 58: 12, 59: 12, 60: 12,
    61: 11, 62: 11, 63: 13, 64: 11, 65: 10, 66: 12, 67: 13, 68: 11, 69: 11, 70: 12,
    71: 11, 72: 11, 73: 11, 74: 12, 75: 11, 76: 10, 77: 12, 78: 12, 79: 11, 80: 12,
    81: 11, 82: 11, 83: 14, 84: 17, 85: 21, 86: 24, 87: 17,
}

JOB_ID = "0f82c23d-7817-4fdd-b85c-4a5020d54b31"

# Признаки подозрительности
RE_TOZHE = re.compile(r"^то\s*же\b", re.IGNORECASE)
RE_DUP_PHRASE = re.compile(r"(.{15,})\s+\1", re.IGNORECASE)  # повтор фразы
RE_TRAILING_HYPHEN = re.compile(r"-\s*$")  # word-break не закрытый


def detect_issues(item: dict, prev_item: dict | None) -> list[str]:
    issues = []
    name = (item.get("name") or "").strip()
    model = (item.get("model_name") or "").strip()

    # 1. Дубль continuation в name («в комплекте. в комплекте.»)
    if RE_DUP_PHRASE.search(name):
        issues.append("DUP_CONTINUATION_IN_NAME")
    if RE_DUP_PHRASE.search(model):
        issues.append("DUP_IN_MODEL")

    # 2. «То же» без unfolded parent — recognition не наследовал
    if RE_TOZHE.match(name):
        issues.append("TOZHE_NOT_INHERITED")

    # 3. Слишком длинный model_name (>100 chars) — cross-merge от соседа
    if len(model) > 100:
        issues.append("MODEL_TOO_LONG")

    # 4. Trailing dash — word-break не закрылся
    if RE_TRAILING_HYPHEN.search(name) or RE_TRAILING_HYPHEN.search(model):
        issues.append("TRAILING_HYPHEN")

    # 5. Точный дубль с предыдущим (name+qty)
    if prev_item:
        if (
            (prev_item.get("name") or "") == name
            and abs((prev_item.get("quantity") or 0) - (item.get("quantity") or 0)) < 1e-6
            and (prev_item.get("model_name") or "") == model
        ):
            issues.append("EXACT_DUP_PREV")

    return issues


def main():
    # Connect to ismeta postgres (port 5433 на host)
    conn = psycopg2.connect(
        host="localhost", port=5433,
        dbname="ismeta", user="ismeta", password="ismeta",
    )
    cur = conn.cursor()
    cur.execute(
        "SELECT items, pages_summary FROM recognition_jobs_recognitionjob WHERE id=%s",
        (JOB_ID,),
    )
    items, pages_summary = cur.fetchone()
    cur.close()
    conn.close()

    # Группировка по page
    by_page: dict[int, list[dict]] = {}
    for it in items:
        pg = it.get("page_number") or 0
        by_page.setdefault(pg, []).append(it)

    # Per-page summary
    print("# Spec-4 (Спорт-школа КЛИН) — карта несоответствия PDF↔смета\n")
    print(f"**Job:** `{JOB_ID}`")
    print(f"**Items in DB:** {len(items)}")
    print(f"**PO total expected:** {sum(PO_COUNTS.values())}")
    print(f"**Pages:** {max(by_page.keys())}\n")

    print("## Per-page count comparison\n")
    print("| Page | PO | DB | Δ | Issues |")
    print("|---:|---:|---:|---:|---|")

    total_issues = 0
    bad_pages = []
    for pg in sorted(by_page.keys()):
        po = PO_COUNTS.get(pg, 0)
        db = len(by_page[pg])
        delta = db - po
        # Сосчитать item issues
        page_issues = []
        prev = None
        for it in by_page[pg]:
            issues = detect_issues(it, prev)
            if issues:
                page_issues.extend(issues)
            prev = it
        n_issues = len(page_issues)
        total_issues += n_issues
        flag = "" if delta == 0 else ("✓ count" if delta == 0 else f"**Δ={delta:+d}**")
        issues_summary = ", ".join(sorted(set(page_issues))) if page_issues else "—"
        marker = "🔴" if (delta != 0 or n_issues > 0) else "✓"
        print(f"| {pg} | {po} | {db} | {delta:+d} | {marker} {issues_summary} |")
        if delta != 0 or n_issues > 0:
            bad_pages.append((pg, po, db, delta, page_issues))

    print(f"\n**Всего items с подозрительными признаками: {total_issues}**\n")
    print(f"**Страниц с расхождением count или issues: {len(bad_pages)} / {len(by_page)}**\n")

    # Детальная раскладка для проблемных страниц
    print("## Детали проблемных страниц\n")
    for pg, po, db, delta, page_issues in bad_pages:
        print(f"### Лист {pg} — PO={po}, DB={db}, Δ={delta:+d}\n")
        for i, it in enumerate(by_page[pg], 1):
            issues = detect_issues(it, by_page[pg][i-2] if i >= 2 else None)
            name = (it.get("name") or "")[:90]
            qty = it.get("quantity")
            unit = it.get("unit") or ""
            model = (it.get("model_name") or "")[:50]
            mfr = (it.get("manufacturer") or "")[:15]
            issue_marker = " 🔴 " + ", ".join(issues) if issues else ""
            print(f"- **{i}.** `{name}` × {qty} {unit} | `{model}` | {mfr}{issue_marker}")
        print()


if __name__ == "__main__":
    main()
