# ТЗ: E19-2 — Backend: RecognitionJob модель + queue worker + endpoints (IS-Петя)

**Команда:** IS-Петя.
**Ветка:** `ismeta/e19-2-recognition-jobs`.
**Worktree:** `ERP_Avgust_is_petya_e19_2`.
**Приоритет:** 🟢 feature E19. Зависимость: **E19-1 в main**.
**Срок:** ~1.5 дня.

---

## Контекст

Master spec: [`ismeta/specs/17-background-recognition-jobs.md`](../../specs/17-background-recognition-jobs.md).
E19-1: recognition теперь имеет `POST /v1/parse/spec/async` с callbacks на URL.

Текущий backend `apps/estimate/pdf_views.py` синхронно ждёт recognition (timeout 1800s). Нужно перевести на async pattern с отдельной таблицей jobs.

---

## Задача

### 1. Новое app `recognition_jobs`

```
ismeta/backend/apps/recognition_jobs/
├── __init__.py
├── apps.py
├── models.py
├── serializers.py
├── views.py
├── urls.py
├── worker.py        # job dispatcher
├── migrations/
└── tests/
```

В `INSTALLED_APPS`.

### 2. Модель `RecognitionJob`

```python
import uuid
from django.db import models
from django.conf import settings

class RecognitionJob(models.Model):
    STATUS_CHOICES = [
        ("queued", "В очереди"),
        ("running", "В работе"),
        ("done", "Готово"),
        ("failed", "Ошибка"),
        ("cancelled", "Отменено"),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    estimate = models.ForeignKey(
        "estimate.Estimate", on_delete=models.CASCADE,
        related_name="recognition_jobs",
    )
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=20)  # "pdf"/"excel"/"spec"/"invoice"
    file_blob = models.BinaryField()  # хранилище загруженного файла на время job'а
    profile = models.ForeignKey(
        "llm_profiles.LLMProfile", null=True, blank=True,
        on_delete=models.SET_NULL,
    )  # E18, опционально
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="queued")
    pages_total = models.IntegerField(null=True, blank=True)
    pages_done = models.IntegerField(default=0)
    items_count = models.IntegerField(default=0)
    items = models.JSONField(default=list)  # накопительный
    llm_costs = models.JSONField(default=dict)
    error_message = models.TextField(blank=True, default="")
    cancellation_token = models.CharField(max_length=64, default="")  # для callback auth
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["created_by", "created_at"]),
        ]
    
    @property
    def is_active(self) -> bool:
        return self.status in ("queued", "running")
    
    @property
    def duration_seconds(self) -> int | None:
        if self.started_at and self.completed_at:
            return int((self.completed_at - self.started_at).total_seconds())
        return None
```

`file_blob` хранит загруженный PDF до завершения job (чтобы worker мог отправить на recognition асинхронно). После `done` — обнулить чтобы не раздувать БД (в follow-up задаче, не критично для MVP).

### 3. Queue worker

**Файл:** `apps/recognition_jobs/worker.py`.

Пул worker'ов через **management command** + `asyncio` loop:

```python
# apps/recognition_jobs/management/commands/recognition_worker.py
import asyncio
from django.core.management.base import BaseCommand
from apps.recognition_jobs.worker import run_worker

class Command(BaseCommand):
    help = "Run recognition jobs worker (async)."
    def handle(self, *args, **options):
        asyncio.run(run_worker())
```

```python
# apps/recognition_jobs/worker.py
import asyncio
from django.conf import settings
from .models import RecognitionJob

MAX_PARALLEL_JOBS = getattr(settings, "RECOGNITION_MAX_PARALLEL_JOBS", 2)

async def run_worker():
    sema = asyncio.Semaphore(MAX_PARALLEL_JOBS)
    while True:
        job = await sync_to_async(_pick_next_queued_job)()
        if job is None:
            await asyncio.sleep(2)
            continue
        asyncio.create_task(_run_with_semaphore(job, sema))

async def _run_with_semaphore(job, sema):
    async with sema:
        await _dispatch_job(job)

@sync_to_async
def _pick_next_queued_job():
    with transaction.atomic():
        job = RecognitionJob.objects.select_for_update(skip_locked=True)\
            .filter(status="queued").order_by("created_at").first()
        if job:
            job.status = "running"
            job.started_at = timezone.now()
            job.save(update_fields=["status", "started_at"])
        return job

async def _dispatch_job(job: RecognitionJob):
    """POST на recognition /v1/parse/spec/async с callback URL."""
    callback_url = f"{settings.BACKEND_INTERNAL_URL}/api/v1/recognition-jobs/{job.id}/callback/"
    headers = {
        "X-Callback-URL": callback_url,
        "X-Job-Id": str(job.id),
        "X-Callback-Token": job.cancellation_token,
        "X-API-Key": settings.RECOGNITION_API_KEY,
    }
    if job.profile:  # E18
        headers.update({
            "X-LLM-Base-URL": job.profile.base_url,
            "X-LLM-API-Key": job.profile.get_api_key(),
            "X-LLM-Extract-Model": job.profile.extract_model,
            ...
        })
    files = {"file": (job.file_name, job.file_blob, "application/pdf")}
    async with httpx.AsyncClient(timeout=30.0) as client:
        await client.post(
            f"{settings.RECOGNITION_URL}/v1/parse/spec/async",
            headers=headers, files=files,
        )
    # Не ждём ответа — recognition пришлёт callbacks сам.
```

В docker-compose добавить sidecar service `recognition-worker`:
```yaml
recognition-worker:
  build: ./backend
  command: python manage.py recognition_worker
  depends_on:
    postgres: { condition: service_healthy }
  env_file: .env
```

Альтернатива — **в самом ismeta-backend контейнере параллельный thread**. Сложнее, отложим.

### 4. Endpoints

**`apps/recognition_jobs/views.py`:**

```python
class RecognitionJobViewSet(viewsets.ModelViewSet):
    serializer_class = RecognitionJobSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "delete"]  # без update

    def get_queryset(self):
        qs = RecognitionJob.objects.select_related("estimate", "profile", "created_by")
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status__in=status_filter.split(","))
        estimate_id = self.request.query_params.get("estimate_id")
        if estimate_id:
            qs = qs.filter(estimate_id=estimate_id)
        return qs

    @action(detail=True, methods=["post"], url_path="cancel", permission_classes=[IsAuthenticated])
    def cancel(self, request, pk=None):
        job = self.get_object()
        if not job.is_active:
            return Response({"detail": "Job not active"}, status=409)
        if job.status == "running":
            # POST на recognition /cancel
            try:
                requests.post(
                    f"{settings.RECOGNITION_URL}/v1/parse/spec/cancel/{job.id}",
                    headers={"X-API-Key": settings.RECOGNITION_API_KEY}, timeout=10,
                )
            except Exception:
                logger.warning("recognition cancel failed", extra={"job_id": str(job.id)})
        job.status = "cancelled"
        job.completed_at = timezone.now()
        job.save(update_fields=["status", "completed_at"])
        return Response({"id": str(job.id), "status": "cancelled"})

    @action(detail=True, methods=["post"], url_path="callback",
            permission_classes=[AllowAny], authentication_classes=[])
    def callback(self, request, pk=None):
        """Recognition присылает page_done / finished / failed / cancelled callbacks."""
        token_header = request.headers.get("X-Callback-Token", "")
        try:
            job = RecognitionJob.objects.get(pk=pk)
        except RecognitionJob.DoesNotExist:
            return Response({"detail": "not_found"}, status=404)
        if not constant_time_compare(token_header, job.cancellation_token):
            return Response({"detail": "forbidden"}, status=403)
        
        event = request.data.get("event")
        if event == "started":
            job.status = "running"
        elif event == "page_done":
            job.pages_done = (job.pages_done or 0) + 1
            page_items = request.data.get("items", [])
            existing_items = job.items or []
            existing_items.extend(page_items)
            job.items = existing_items
            job.items_count = len(existing_items)
        elif event == "finished":
            job.status = "done"
            job.completed_at = timezone.now()
            job.items = request.data.get("items", [])
            job.items_count = len(job.items)
            job.llm_costs = request.data.get("llm_costs") or {}
            job.pages_total = request.data.get("pages_total")
            # Apply items в Estimate
            self._apply_items_to_estimate(job)
        elif event == "failed":
            job.status = "failed"
            job.completed_at = timezone.now()
            job.error_message = request.data.get("error", "")
        elif event == "cancelled":
            job.status = "cancelled"
            job.completed_at = timezone.now()
        job.save()
        return Response({"ok": True})

    @staticmethod
    def _apply_items_to_estimate(job: RecognitionJob):
        """После finished — items идут в Estimate как новые EstimateItem.
        Использует существующий код apply_recognition_items (из current pdf_views)."""
        from apps.estimate.services.pdf_import_service import apply_recognition_items
        apply_recognition_items(job.estimate, job.items, file_name=job.file_name)
```

**URL:** `/api/v1/recognition-jobs/` через router. Подключить в `ismeta/backend/api/urls.py`.

### 5. Создание job из existing import endpoint

**Файл:** `apps/estimate/pdf_views.py`.

Текущий sync handler оставить как fallback (`?async=false`). По умолчанию async:

```python
@api_view(["POST"])
def import_pdf(request, estimate_id):
    is_async = request.GET.get("async", "true").lower() == "true"
    if not is_async:
        # старый sync flow
        return _sync_import_pdf(request, estimate_id)
    
    # новый async
    estimate = get_object_or_404(Estimate, pk=estimate_id)
    pdf_file = request.FILES["file"]
    profile_id = request.POST.get("llm_profile_id")
    profile = LLMProfile.objects.filter(id=profile_id).first() if profile_id else None
    
    job = RecognitionJob.objects.create(
        estimate=estimate,
        file_name=pdf_file.name,
        file_type="pdf",
        file_blob=pdf_file.read(),
        profile=profile,
        cancellation_token=secrets.token_urlsafe(32),
        created_by=request.user if request.user.is_authenticated else None,
    )
    serializer = RecognitionJobSerializer(job)
    return Response(serializer.data, status=202)
```

### 6. BACKEND_INTERNAL_URL

В `settings.py`:
```python
BACKEND_INTERNAL_URL = env("BACKEND_INTERNAL_URL", default="http://ismeta-backend:8000")
```

В `.env.example`:
```
BACKEND_INTERNAL_URL=http://ismeta-backend:8000
RECOGNITION_MAX_PARALLEL_JOBS=2
```

### 7. Тесты

`apps/recognition_jobs/tests/test_models.py`:
- Создание/list/cancel
- callback с правильным token обновляет state
- callback с неверным token → 403

`tests/test_worker.py`:
- _pick_next_queued_job атомарно (select_for_update + skip_locked)
- semaphore лимитирует параллельность

`tests/test_import_async.py`:
- POST `/import/pdf/?async=true` → 202 + job_id
- Backward compat: `?async=false` → старый sync flow

### 8. Документация

`apps/recognition_jobs/README.md` — кратко: модель, worker, callback contract.

---

## Приёмочные критерии

1. ✅ Миграция `recognition_jobs/0001_initial` чисто применяется.
2. ✅ POST `/api/v1/estimates/{id}/import/pdf/?async=true` создаёт job + возвращает 202.
3. ✅ Worker management command `python manage.py recognition_worker` поднимается в отдельном sidecar контейнере, забирает queued jobs и POST'ит на recognition.
4. ✅ Callbacks от recognition обновляют RecognitionJob (status / pages_done / items).
5. ✅ После `finished` items создаются как EstimateItem в смете (тот же путь что sync).
6. ✅ Cancel endpoint останавливает работу.
7. ✅ Backward compat: sync flow `?async=false` работает идентично текущему.
8. ✅ Тесты зелёные.

---

## Ограничения

- **НЕ удалять** sync endpoint поведение — только добавить async flag.
- **НЕ persistить** через recognition restart — known limit MVP.
- **НЕ хранить** plain LLMProfile.api_key (берём через `profile.get_api_key()` decrypt).

---

## Формат отчёта

1. Ветка + hash.
2. Список новых/изменённых файлов.
3. Curl-демо: POST `?async=true` → 202 → polling `GET /recognition-jobs/{id}/` → eventually status=done.
4. Команда запуска воркера + лог.
5. pytest summary.

---

## Start-prompt для Пети (копировать)

```
Добро пожаловать. Ты — IS-Петя, backend AI-программист.

ПЕРВЫМ ДЕЛОМ:

1. Онбординг: ismeta/docs/agent-tasks/ONBOARDING.md
2. Master спека: ismeta/specs/17-background-recognition-jobs.md
3. ТЗ: ismeta/docs/agent-tasks/E19-2-backend-recognition-jobs-petya.md

Worktree: /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_is_petya_e19_2
Ветка: ismeta/e19-2-recognition-jobs (от origin/main, убедись что E19-1 замержен).

Контекст: фича E19 — background jobs для recognition. Сметчик загружает
PDF → диалог моментально закрывается → работает дальше. Шапка показывает
индикатор. Toast при готовности. E19-1 (recognition async + callbacks)
сделан. Твоя часть — Django модель RecognitionJob + worker (management
command sidecar) + endpoints (create, list, cancel, callback) + интеграция
с existing import-pdf flow.

Работай строго по ТЗ. Push в свою ветку, отчёт по формату.
```
