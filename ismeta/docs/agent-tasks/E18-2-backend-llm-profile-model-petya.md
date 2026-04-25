# ТЗ: E18-2 — Backend: модель `LLMProfile` + CRUD + proxy в recognition (IS-Петя)

**Команда:** IS-Петя.
**Ветка:** `ismeta/e18-2-llm-profile-model`.
**Worktree:** `ERP_Avgust_is_petya_e18_2`.
**Приоритет:** 🟢 feature E18 (продолжение E18-1).
**Срок:** ~1.5 дня.
**Зависимость:** E18-1 (recognition headers + cost) **должна быть замержена в main**.

---

## Контекст

Master spec: [`ismeta/specs/16-llm-profiles.md`](../../specs/16-llm-profiles.md).
Предыдущая часть: [`E18-1-recognition-llm-profile-headers-petya.md`](./E18-1-recognition-llm-profile-headers-petya.md) — recognition теперь принимает headers `X-LLM-*` и возвращает `llm_costs`.

Текущий backend (`ismeta/backend/`):
- `apps/estimate/views.py` — endpoint импорта PDF (`POST /api/v1/estimates/{id}/import-pdf/`) проксирует файл на recognition `:8003` без override headers.
- `RECOGNITION_URL`, `RECOGNITION_API_KEY` — env vars для базовой connectivity.

---

## Задача

### 1. Новое app `llm_profiles`

```
ismeta/backend/apps/llm_profiles/
├── __init__.py
├── apps.py
├── models.py
├── serializers.py
├── views.py
├── urls.py
├── encryption.py
├── migrations/
└── tests/
```

Зарегистрировать в `INSTALLED_APPS`.

### 2. Модель `LLMProfile`

```python
class LLMProfile(models.Model):
    name = models.CharField(max_length=100, unique=True)
    base_url = models.URLField(default="https://api.openai.com")
    api_key_encrypted = models.BinaryField()
    extract_model = models.CharField(max_length=100)
    multimodal_model = models.CharField(max_length=100, blank=True, default="")
    classify_model = models.CharField(max_length=100, blank=True, default="")
    vision_supported = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="created_llm_profiles",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ["-is_default", "name"]
    
    def get_api_key(self) -> str:
        """Decrypt и вернуть plain text. Только для proxy-вызовов."""
        return decrypt_value(self.api_key_encrypted)
    
    def set_api_key(self, plain: str) -> None:
        """Зашифровать и сохранить."""
        self.api_key_encrypted = encrypt_value(plain)
```

### 3. Encryption

**Файл:** `apps/llm_profiles/encryption.py`.

```python
from cryptography.fernet import Fernet
from django.conf import settings

def _fernet() -> Fernet:
    key = settings.LLM_PROFILE_ENCRYPTION_KEY  # base64-encoded 32 bytes
    if not key:
        raise ImproperlyConfigured("LLM_PROFILE_ENCRYPTION_KEY not set")
    return Fernet(key.encode() if isinstance(key, str) else key)

def encrypt_value(plain: str) -> bytes:
    return _fernet().encrypt(plain.encode("utf-8"))

def decrypt_value(token: bytes) -> str:
    return _fernet().decrypt(token).decode("utf-8")
```

В `settings.py` добавить:
```python
LLM_PROFILE_ENCRYPTION_KEY = env("LLM_PROFILE_ENCRYPTION_KEY", default="")
```

В `.env.example` (gitignored .env уже есть):
```
LLM_PROFILE_ENCRYPTION_KEY=  # сгенерировать: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

В docs README объяснить генерацию ключа при первом setup.

**ВАЖНО:** при отсутствии ключа — миграция должна применяться (поле создаётся), но при попытке зашифровать/расшифровать — `ImproperlyConfigured` 500 с понятным сообщением «LLM_PROFILE_ENCRYPTION_KEY не задан».

### 4. Migration

`migrations/0001_initial.py` — стандартная Django migration. Без data migration.

### 5. Serializer

```python
class LLMProfileSerializer(serializers.ModelSerializer):
    api_key = serializers.CharField(write_only=True, required=False)
    api_key_preview = serializers.SerializerMethodField()
    
    class Meta:
        model = LLMProfile
        fields = [
            "id", "name", "base_url",
            "extract_model", "multimodal_model", "classify_model",
            "vision_supported", "is_default",
            "api_key", "api_key_preview",
            "created_by", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]
    
    def get_api_key_preview(self, obj):
        try:
            plain = obj.get_api_key()
            return f"***{plain[-4:]}" if len(plain) >= 4 else "***"
        except Exception:
            return "***"
    
    def create(self, validated_data):
        api_key = validated_data.pop("api_key", None)
        if not api_key:
            raise serializers.ValidationError({"api_key": "Required on create"})
        instance = LLMProfile(**validated_data)
        instance.set_api_key(api_key)
        instance.save()
        return instance
    
    def update(self, instance, validated_data):
        api_key = validated_data.pop("api_key", None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if api_key:
            instance.set_api_key(api_key)
        instance.save()
        return instance
```

### 6. CRUD ViewSet

```python
class LLMProfileViewSet(viewsets.ModelViewSet):
    queryset = LLMProfile.objects.all()
    serializer_class = LLMProfileSerializer
    permission_classes = [IsAuthenticated]  # + admin для create/delete
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=["post"], url_path="set-default")
    def set_default(self, request, pk=None):
        with transaction.atomic():
            LLMProfile.objects.filter(is_default=True).update(is_default=False)
            profile = self.get_object()
            profile.is_default = True
            profile.save()
        return Response({"id": profile.id, "is_default": True})
    
    @action(detail=False, methods=["get"], url_path="default")
    def default(self, request):
        profile = LLMProfile.objects.filter(is_default=True).first()
        if not profile:
            return Response({"detail": "No default profile"}, status=404)
        return Response(LLMProfileSerializer(profile).data)
    
    @action(detail=False, methods=["post"], url_path="test-connection")
    def test_connection(self, request):
        """Проверить connectivity к base_url с переданным api_key.
        Body: {base_url, api_key}. Делает GET base_url/v1/models с Bearer auth."""
        base = request.data.get("base_url", "").rstrip("/")
        key = request.data.get("api_key", "")
        if not base or not key:
            return Response({"ok": False, "error": "base_url and api_key required"}, status=400)
        try:
            r = requests.get(f"{base}/v1/models", headers={"Authorization": f"Bearer {key}"}, timeout=10)
            return Response({"ok": r.status_code == 200, "status_code": r.status_code})
        except Exception as e:
            return Response({"ok": False, "error": str(e)}, status=200)
```

URL: `/api/v1/llm-profiles/` через router. Подключить в `ismeta/backend/api/urls.py`.

### 7. Proxy в `import-pdf/`

**Файл:** `apps/estimate/views.py` (или views/import.py).

Текущий handler (упрощённо):
```python
files = {"file": ...}
r = requests.post(f"{RECOGNITION_URL}/v1/parse/spec", files=files, headers=...)
```

Расширить — принимать `profile_id` из body:

```python
profile_id = request.POST.get("llm_profile_id")
extra_headers = {}
profile = None
if profile_id:
    profile = LLMProfile.objects.filter(id=profile_id).first()
    if not profile:
        return JsonResponse({"error": "profile_not_found"}, status=400)
    extra_headers = {
        "X-LLM-Base-URL": profile.base_url,
        "X-LLM-API-Key": profile.get_api_key(),
        "X-LLM-Extract-Model": profile.extract_model,
        "X-LLM-Multimodal-Model": profile.multimodal_model or profile.extract_model,
        "X-LLM-Classify-Model": profile.classify_model or profile.extract_model,
        "X-LLM-Vision-Counter-Enabled": "true" if profile.vision_supported else "false",
        "X-LLM-Multimodal-Retry-Enabled": "true" if profile.vision_supported else "false",
    }

r = requests.post(
    f"{RECOGNITION_URL}/v1/parse/spec",
    files=files,
    headers={"X-API-Key": RECOGNITION_API_KEY, **extra_headers},
)
```

Аналогично для `import-invoice/` если есть.

**Если `profile_id` не передан** — extra_headers пустой, recognition использует defaults (текущее поведение).

### 8. Сохранение в `ImportLog`

Если в проекте уже есть какая-то модель ImportLog / EstimateImport / похожая — расширь её. Если нет — создай минимальную.

Проверь `apps/estimate/models.py` на существующие related-объекты. **Если ничего нет** — добавь:

```python
class ImportLog(models.Model):
    estimate = models.ForeignKey(Estimate, on_delete=models.CASCADE, related_name="import_logs")
    file_type = models.CharField(max_length=20)  # "pdf"/"excel"
    profile = models.ForeignKey(LLMProfile, null=True, blank=True, on_delete=models.SET_NULL)
    cost_usd = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    items_created = models.IntegerField()
    pages_processed = models.IntegerField(null=True, blank=True)
    llm_metadata = models.JSONField(default=dict)  # llm_costs payload + model versions
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
```

После успешного recognition response — создать ImportLog (with `cost_usd = response_json["llm_costs"]["total_usd"]`, `llm_metadata = response_json["llm_costs"]`).

### 9. API endpoint для history

```python
class ImportLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ImportLogSerializer
    queryset = ImportLog.objects.select_related("estimate", "profile").all()
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        qs = super().get_queryset()
        estimate_id = self.request.query_params.get("estimate_id")
        if estimate_id:
            qs = qs.filter(estimate_id=estimate_id)
        return qs
```

URL: `/api/v1/import-logs/`.

### 10. Тесты

`apps/llm_profiles/tests/test_models.py`:
- Создание профиля шифрует ключ. `get_api_key()` возвращает plain.
- `set_default` переустанавливает is_default атомарно.

`apps/llm_profiles/tests/test_views.py`:
- POST /api/v1/llm-profiles/ создаёт профиль с api_key (не возвращается в response, только preview).
- GET / list returns api_key_preview = `***last4`.
- Test-connection mock httpx → ok=true.

`apps/estimate/tests/test_import_pdf_with_profile.py`:
- POST /api/v1/estimates/{id}/import-pdf/ с `llm_profile_id` → mock recognition вызывается с правильными `X-LLM-*` headers.
- Без `llm_profile_id` → headers не передаются.
- Ответ создаёт ImportLog с правильным cost_usd.

### 11. Documentation

Обновить:
- `ismeta/docs/agent-tasks/ONBOARDING.md` — секция «LLM-профили» с командой генерации Fernet key.
- `ismeta/.env.example` — добавить `LLM_PROFILE_ENCRYPTION_KEY=` с комментарием.
- README ismeta — упомянуть про LLM-профили.

---

## Приёмочные критерии

1. ✅ Миграция `0001_initial` чисто применяется (`./manage.py migrate llm_profiles`).
2. ✅ CRUD `/api/v1/llm-profiles/` работает (create/list/retrieve/update/delete).
3. ✅ `set-default` атомарно переключает дефолт.
4. ✅ `test-connection` валидирует base_url + api_key через `GET /v1/models`.
5. ✅ `import-pdf/` пропускает `X-LLM-*` headers если `llm_profile_id` передан.
6. ✅ ImportLog сохраняется после успешного import с `cost_usd` из recognition response.
7. ✅ Encryption работает: api_key plain в БД не хранится, в response — только `***last4` preview.
8. ✅ Все тесты зелёные (`pytest apps/llm_profiles apps/estimate`).
9. ✅ `manage.py check` clean. Migrations linter clean.
10. ✅ `.env.example` обновлён, в README инструкция генерации ключа.

---

## Ограничения

- **НЕ хранить** plain api_key нигде кроме process memory (decrypt при proxy call → передал → забыл).
- **НЕ возвращать** plain api_key в API response никогда.
- **НЕ удалять** профиль если он `is_default=True` — вернуть 409 «Сначала переустановите дефолт».
- **НЕ менять** контракт recognition (это E18-1).
- **НЕ интегрировать** workspace-scoping профилей в MVP (глобальные).

---

## Формат отчёта

1. Ветка + hash.
2. Список новых/изменённых файлов.
3. Команда генерации ключа Fernet (показать пример).
4. Skрин/curl результата:
   - Создание профиля (без api_key в response)
   - Set-default
   - Import PDF с профилем (показать что в ImportLog появился cost)
5. pytest summary.
6. Migration check (`makemigrations --dry-run`).

---

## Start-prompt для Пети (копировать)

```
Добро пожаловать. Ты — IS-Петя, backend AI-программист проекта
ISMeta. Работаешь автономно в своей Claude-сессии.

ПЕРВЫМ ДЕЛОМ:

1. Прочитай онбординг:
   ismeta/docs/agent-tasks/ONBOARDING.md

2. Прочитай master спеку:
   ismeta/specs/16-llm-profiles.md

3. Прочитай своё ТЗ:
   ismeta/docs/agent-tasks/E18-2-backend-llm-profile-model-petya.md

Рабочая директория:
  /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_is_petya_e18_2

Твоя ветка: ismeta/e18-2-llm-profile-model (создана от
origin/main; убедись что E18-1 уже замержен в main).

Контекст: добавляем LLM-профили (несколько настроек моделей —
OpenAI/DeepSeek/etc), чтобы PO мог переключаться без рестарта
контейнера + видеть стоимость каждого распознавания. E18-1
(recognition headers + costs) уже сделан Петей-1. Твоя часть —
Django модель LLMProfile + CRUD + proxy в import-pdf.

Работай строго по ТЗ. После — push в свою ветку, отчёт по формату.
```
