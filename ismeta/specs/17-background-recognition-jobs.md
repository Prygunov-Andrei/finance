# 17. Background recognition jobs (E19)

**Статус:** DRAFT (2026-04-25). PO даёт go отдельной командой.

## Зачем

Сметчик загрузил PDF → распознавание идёт 4-15 минут (на качественной модели DeepSeek v4-pro thinking high). Сейчас запрос синхронный: пользователь ждёт с открытым диалогом, не может работать.

PO: «сметчик должен иметь возможность работать дальше — открыть другую смету, размещать файлы, уточнять данные по объекту. Визуально видит что данные пошли, спокойно пошёл чаёк заварил».

## Use cases

1. **Background after submit.** Сметчик загружает PDF в смету A → видит баннер «Распознавание идёт…», закрывает диалог, идёт в смету B. В nav-bar — `🔄 1`.
2. **Несколько параллельных jobs.** Сметчик открывает смету B, тоже загружает PDF. Теперь `🔄 2` (или «1 + 1 в очереди» если limit=1).
3. **Cancellation.** Сметчик понял что загрузил не тот PDF → клик на job в panel → «Отменить». Recognition прерывается, не платим за остаток.
4. **Notification.** Сметчик где-то в ERP заварил чай → toast «Смета "Объект X": 199 позиций распознано». Клик — переход в смету, items уже там.

## Не входит в MVP

- Email/push notification (только in-app toast).
- Persistence через рестарт recognition (in-memory state теряется → fail running jobs).
- Re-queue после fail.
- Per-user / per-workspace scoping (глобальный list пока).
- Edit во время stream (PO явно сказал «не важно, всегда есть другая задача»).
- Real-time stream items в открытую таблицу (упростили до «дождался → открыл»).
- Скачать Excel прямо из jobs panel / toast (PO решил — не нужно).

## UX flow (зафиксировано PO 2026-04-25)

1. **Запуск.** Сметчик в смете A → «Импорт PDF» → выбирает файл → «Загрузить». Диалог **закрывается мгновенно**. Внизу справа toast 5 сек: *«Распознавание "Спецификация ОВ2" запущено. Можете продолжать работу.»*

2. **Индикатор в шапке.** В nav-bar справа — иконка `🔄 N` с pulsing анимацией. N = количество active jobs (queued + running). Click → popover со списком (см. ниже).

3. **Прогресс в самой смете.** На странице сметы A — узкая Alert полоска сверху таблицы: «Распознавание: страница 3 из 9 ⏳» + progress-bar. Под ней — пустая таблица items пока.

4. **Многозадачность.** Сметчик уходит в смету B → запускает второй PDF → шапка показывает `🔄 2`. Идёт в раздел документы / правит данные объекта — jobs не мешают.

5. **Popover «что у меня в работе».** Click по `🔄` в шапке → компактный список:
   ```
   ⏳ Объект А · "Спецификация ОВ2"
      [████████░░] 7/9 стр · ~2 мин
      [Открыть]  [Отменить]
   ⏳ Объект Б · "Спецификация АОВ"
      [████░░░░░░] 1/2 стр
      [Открыть]  [Отменить]
   ```
   «Открыть» — переход в смету. «Отменить» — confirm() → recognition прерывается → job=`cancelled`.

6. **Сигнал о завершении.** Job `done` → большой toast (10 сек visible):
   ```
   ✓ Объект А
   199 позиций распознано ($0.12)
                    [Открыть смету]
   ```
   Иконка в шапке: `🔄 N-1`.

7. **Звук** — опционально, **выключен по умолчанию**. В настройках профиля сметчика: «Звуковой сигнал при завершении распознавания». Короткий «ding».

8. **Сметчик закрыл вкладку.** Job продолжается на бэке. Открыл через час → шапка `✓ 2 завершено` (бейдж непрочитанных). Click → история с timestamp'ами: «10:23 ✓ Объект А · 199 поз», «10:31 ✓ Объект Б · 29 поз». После просмотра — иконка серая.

9. **История.** Все завершённые jobs хранятся **forever** (БД). В popover показывать **только за текущий день**, остальное — в отдельной странице «История распознавания» (на MVP не делать, только endpoint для будущего).

10. **Ошибка.** DeepSeek 5xx / network → ретраи в recognition (текущий механизм 6 попыток). Если ретраи исчерпаны → job=`failed`. Toast: *«✗ Объект В: ошибка распознавания. [Повторить]»*. В смете — баннер «Ошибка, [Попробовать снова]». Кнопка повтора создаёт новый job с тем же файлом.

## Ключевые UX правила (для ТЗ агентам)

1. **Невидимая магия.** Запустил → закрыл диалог → работай дальше. Никаких блокировок.
2. **Один источник правды.** Иконка `🔄` в шапке — единственный глобальный индикатор. Куда бы ни ушёл сметчик, она видна.
3. **Toast как пуш-уведомление.** Короткое, с action-кнопкой («Открыть»).
4. **Прогресс там где запустил.** В смете — баннер с progress-bar. Закрыл вкладку — банер появится снова при возврате.
5. **Cancellation — один клик + confirm.** DeepSeek thinking high это $$ — нужна страховка от случайного клика.



## Архитектура (3 слоя)

### 1. Recognition (FastAPI :8003)

**Новый endpoint `POST /v1/parse/spec/async`:**
- Принимает file + headers (включая `X-LLM-*` от E18) + `X-Callback-URL`, `X-Job-Id`
- Создаёт background task через `asyncio.create_task()`
- Возвращает 202 Accepted сразу
- В фоне: парсит → после каждой готовой страницы POST callback с `{event:"page_done", page, items, partial_count}`. В конце POST `{event:"finished", items, llm_costs}`. При ошибке — `{event:"failed", error}`.
- При cancellation: получает сигнал через POST `/v1/parse/spec/cancel?job_id=X` → asyncio.Task.cancel() → POST callback `{event:"cancelled"}`.

**Глобальный rate-limit:** semaphore на уровне процесса, не per-job. `LLM_GLOBAL_CONCURRENCY=4` (default — суммарно по всем running jobs). Текущий `LLM_MAX_CONCURRENCY=3` — per-job (внутри одного PDF).

**In-memory job registry:** `dict[job_id, asyncio.Task]` для cancellation. При рестарте recognition — registry теряется, jobs не возобновляются (известный limit MVP).

### 2. Backend (Django ismeta)

**Модель `RecognitionJob`:**
```python
class RecognitionJob(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    estimate = models.ForeignKey(Estimate, on_delete=models.CASCADE, related_name="recognition_jobs")
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=20)  # pdf/excel/spec/invoice
    profile = models.ForeignKey(LLMProfile, null=True, blank=True, on_delete=models.SET_NULL)  # E18
    status = models.CharField(choices=[
        ("queued", "В очереди"),
        ("running", "В работе"),
        ("done", "Готово"),
        ("failed", "Ошибка"),
        ("cancelled", "Отменено"),
    ], max_length=20, default="queued")
    pages_total = models.IntegerField(null=True, blank=True)
    pages_done = models.IntegerField(default=0)
    items_count = models.IntegerField(default=0)
    items = models.JSONField(default=list)  # накопительный список
    llm_costs = models.JSONField(default=dict)  # из E18
    error = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "created_at"])]
```

**Очередь:** простая Django table-based queue. Worker (single asyncio loop в Django Channel или management command) пулит `queued` jobs:
- При `len(running) < MAX_PARALLEL_JOBS` (default 2) — забирает следующий queued.
- POST на recognition `/v1/parse/spec/async` с callback URL `https://ismeta-backend/api/v1/recognition-jobs/{job_id}/callback/`.
- Recognition присылает callbacks → handler обновляет `pages_done`, `items`, при `finished` создаёт `EstimateItem`s и `ImportLog` (E18).

**Endpoints:**
- `POST /api/v1/estimates/{estimate_id}/import-pdf-async/` (новый) — создаёт RecognitionJob, статус `queued`. Worker подхватывает.
- `GET /api/v1/recognition-jobs/?status=running,queued` — список активных (для polling).
- `GET /api/v1/recognition-jobs/{id}/` — details.
- `POST /api/v1/recognition-jobs/{id}/cancel/` — если status=running → POST на recognition `/cancel`. Если queued → просто status=cancelled.

**Старый sync endpoint `import-pdf/` остаётся** — для backward compat / случаев когда нужно дождаться.

### 3. Frontend (Next.js ismeta)

**Global `RecognitionJobsContext` (в `app/layout.tsx` или близко):**
- React Query: `useQuery(["recognition-jobs", "active"], () => api.get("/recognition-jobs/?status=running,queued"), { refetchInterval: 5000 })`
- При завершении job (status переход running→done|failed|cancelled): toast.

**Nav-bar badge:**
- Иконка 🔄 + count если active > 0.
- Click → открывает popover со списком: «Смета "Объект X" — 5 из 9 страниц | Cancel». Click на name → переход в estimate.

**`PdfImportDialog`:**
- После submit → POST `import-pdf-async/` → 202. Закрыть диалог немедленно с toast «Распознавание запущено».
- Старый sync flow можно оставить как fallback кнопку «Дождаться» (опционально).

**Estimate detail:**
- Если для этой сметы есть active job → банер сверху «Распознавание идёт: 5/9 страниц». Items появляются в таблицу когда job переходит в `done`.

**Toast при завершении:**
- `Смета "Объект X": 199 позиций распознано ($0.12)` (использует `llm_costs.total_usd`).
- При failed — `Смета "Объект X": ошибка распознавания (детали)` с retry-кнопкой.

## Ключевые решения PO (зафиксировано 2026-04-25)

1. ✅ **Edit во время stream** — НЕ нужен. Lock items до завершения job. PO: «всегда есть другая задача».
2. ✅ **Параллелизм** — 2 параллельных jobs + очередь дальше.
3. ✅ **Cancellation** — нужна. Сметчик должен иметь возможность отменить если случайно загрузил не тот файл.
4. ✅ **Notification** — toast в UI на MVP. Email/push — follow-up.
5. ✅ **Persistence через restart** — НЕ MVP. При рестарте recognition running jobs → fail.

## Декомпозиция в task'и

- **E19-1 (IS-Петя, recognition):** async endpoint + asyncio task registry + callbacks + cancellation + global concurrency semaphore. ~1 день.
- **E19-2 (IS-Петя, backend):** RecognitionJob модель + Django queue worker + endpoints (create-async, list, get, cancel, callback handler). ~1.5 дня.
- **E19-3 (IS-Федя, frontend):** Global context + nav-bar badge/popover + toast on finish + PdfImportDialog rework + estimate banner. ~1.5-2 дня.

Старт строго после явного go PO. Зависимость: E18 (LLM-профили) желательно замержен — иначе `profile` поле в `RecognitionJob` останется опциональным.
