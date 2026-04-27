# TASK — Wave 7 — UI для FeaturedNewsSettings + sidebar для категорий новостей

## Контекст

Андрей зашёл в админку и не нашёл способа управлять:
1. **Категориями новостей** — страница `/erp/hvac/news-categories/` существует, но в sidebar пункта НЕТ.
2. **FeaturedNewsSettings** — какая категория задаёт «главную новость» в hero на `hvac-info.com`. Это singleton-модель в `backend/news/models.py:FeaturedNewsSettings` (один экземпляр pk=1, поле `category` ForeignKey на NewsCategory). Управляется только через Django admin → после Ф8D скрыта в `/admin/`, доступна только через `/hvac-admin/news/featurednewssettings/1/change/`.

Нужно дать ERP-админу удобный UI прямо в `/erp/hvac/`.

---

## 1. Backend — endpoint для FeaturedNewsSettings

**Файлы:**
- `backend/news/admin_views.py` (новый) — `FeaturedNewsSettingsAdminView` (или встроить в `news/views.py` если предпочитаешь — но aдминские view'ы обычно отдельно).
- `backend/news/admin_serializers.py` (новый) — `FeaturedNewsSettingsSerializer`.
- `backend/news/urls.py` — добавить URL.

### Сериализатор
```python
class FeaturedNewsSettingsSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(
        source='category.name', read_only=True, default=None,
    )
    category_slug = serializers.CharField(
        source='category.slug', read_only=True, default=None,
    )
    
    class Meta:
        model = FeaturedNewsSettings
        fields = (
            'id', 'category', 'category_name', 'category_slug',
            'updated_at',
        )
        read_only_fields = ('id', 'updated_at', 'category_name', 'category_slug')
```

`category` — это writable PrimaryKeyRelatedField (по дефолту в ModelSerializer для FK к slug-полю). Проверь — `FeaturedNewsSettings.category` использует `to_field="slug"`, `db_column="category_slug"`. DRF может автоматически отдать slug. Если выходит непредсказуемо — используй явный `serializers.SlugRelatedField(slug_field='slug', queryset=NewsCategory.objects.filter(is_active=True))`.

### View
```python
class FeaturedNewsSettingsAdminView(generics.RetrieveUpdateAPIView):
    """GET/PATCH singleton FeaturedNewsSettings.
    
    GET — текущая категория (или null).
    PATCH с {"category": "<slug>"} — сменить.
    PATCH с {"category": null} — сброс (берётся latest из всех категорий).
    """
    permission_classes = [IsHvacAdminProxyAllowed]
    serializer_class = FeaturedNewsSettingsSerializer
    http_method_names = ['get', 'patch', 'head', 'options']
    
    def get_object(self):
        instance, _created = FeaturedNewsSettings.objects.get_or_create(pk=1)
        return instance
```

### URL
В `backend/news/urls.py` добавь:
```python
path('admin/featured-settings/', FeaturedNewsSettingsAdminView.as_view(), name='admin-featured-settings'),
```

URL получится `/api/hvac/news/admin/featured-settings/` (если `news/urls.py` подключён под `/api/hvac/news/`).

**Важно:** проверь корневой `backend/finans_assistant/urls.py` — где `news/urls.py` подключён. Возможно `/api/v1/hvac/news/` или `/api/hvac/news/`. Адаптируй.

### Permission
`hvac_bridge.permissions.IsHvacAdminProxyAllowed` — стандарт, как в Ф8.

### Тесты
Минимум 4: anon → 401, regular user → 403, staff GET 200, staff PATCH с valid slug → 200 + БД обновилась, staff PATCH `{category: null}` → category стал NULL.

---

## 2. Frontend — sidebar entry «Категории новостей»

**Файл:** `frontend/components/erp/components/Layout.tsx`

В block `id: 'hvac', label: 'HVAC-новости'` добавь child (после `Новости`):

```tsx
{ id: 'hvac-news-categories', label: 'Категории новостей', icon: <Folder className="w-4 h-4" />, path: '/hvac/news-categories', section: 'dashboard' },
```

В `pathToParent`:
```ts
pathToParent['hvac/news-categories'] = { label: 'HVAC-новости', path: '/hvac/news' };
```

---

## 3. Frontend — Card «Главная новость в hero» в NewsCategoriesPage

**Файл:** `frontend/components/hvac/pages/NewsCategoriesPage.tsx`

Сверху страницы (перед списком категорий) добавь Card:

```tsx
<Card className="p-4">
  <div className="flex items-center justify-between gap-4 flex-wrap">
    <div>
      <h3 className="font-semibold">Главная новость в hero (hvac-info.com)</h3>
      <p className="text-sm text-muted-foreground">
        Из выбранной категории берётся последняя 5★-новость для главного блока.
        Пусто = последняя 5★-новость из всех категорий.
      </p>
    </div>
    <div className="flex items-center gap-2">
      <Select value={featuredCategorySlug ?? ''} onValueChange={handleFeaturedChange}>
        <SelectTrigger className="w-64">
          <SelectValue placeholder="— Любая категория —" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">— Любая категория —</SelectItem>
          {activeCategories.map(c => (
            <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={saveFeatured} disabled={savingFeatured}>
        {savingFeatured ? 'Сохранение…' : 'Сохранить'}
      </Button>
    </div>
  </div>
</Card>
```

**State:**
```tsx
const [featuredCategorySlug, setFeaturedCategorySlug] = useState<string | null>(null);
const [savingFeatured, setSavingFeatured] = useState(false);

useEffect(() => {
  newsCategoriesService.getFeaturedSettings()
    .then(s => setFeaturedCategorySlug(s.category_slug ?? null))
    .catch(() => {});
}, []);

const saveFeatured = async () => {
  setSavingFeatured(true);
  try {
    const slug = featuredCategorySlug || null;
    await newsCategoriesService.updateFeaturedSettings({ category: slug });
    toast.success('Сохранено');
  } catch (e) {
    toast.error('Ошибка сохранения');
  } finally {
    setSavingFeatured(false);
  }
};
```

(Точные импорты Card / Select / Button / toast — переиспользуй из существующих pages.)

---

## 4. Frontend — service для FeaturedNewsSettings

**Файл:** `frontend/components/hvac/services/newsCategoriesService.ts`

Добавить методы:
```ts
getFeaturedSettings: async () => {
  const response = await apiClient.get('/hvac/news/admin/featured-settings/');
  return response.data;  // { id, category, category_name, category_slug, updated_at }
},

updateFeaturedSettings: async (payload: { category: string | null }) => {
  const response = await apiClient.patch('/hvac/news/admin/featured-settings/', payload);
  return response.data;
},
```

(Проверь как существующий `apiClient` из этого же service-файла обращается — путь относительно baseURL. Если baseURL уже `/api/hvac-admin` — путь должен быть скорректирован.)

**ВАЖНО:** базовый URL в `frontend/components/hvac/services/apiClient.ts` — это, скорее всего, `/api/v1/hvac/` или `/api/hvac-admin/...`. URL `/admin/featured-settings/` после добавления в `news/urls.py` будет резолвиться по тому же префиксу что и существующие endpoint'ы новостей. Сверь прямо с фактическим путём — посмотри, как `newsCategoriesService.getNewsCategories()` шлёт запрос (URL в DevTools Network) → так же делай и для FeaturedNewsSettings.

---

## 5. Прогон

```bash
cd frontend
npx tsc --noEmit
npm test -- --run NewsCategoriesPage    # если есть тесты, добавь pojos для нового UI
```

Backend:
```bash
pytest backend/news/tests/ --no-cov
```

Smoke в браузере (через dev-сервер локально, если получится — иначе на проде после деплоя):
- `/erp/hvac/news-categories/` — Card «Главная новость в hero» сверху, Select работает, Save обновляет.
- В sidebar появился пункт «Категории новостей».

---

## Что НЕ делаем

- ❌ Не трогаем модель FeaturedNewsSettings — singleton-логика уже есть.
- ❌ Не трогаем публичный endpoint `/featured-news/` — он работает.
- ❌ Не трогаем NewsList / NewsEditor — это отдельное.
- ❌ Не делаем отдельную страницу `/erp/hvac/featured-news/` — встроенный Card на NewsCategoriesPage достаточно.

---

## Известные нюансы

1. **`FeaturedNewsSettings.category`** — FK с `to_field="slug"`, `db_column="category_slug"`. DRF может вернуть slug или int — проверь и адаптируй сериализатор.
2. **Singleton get_or_create** — `FeaturedNewsSettings.objects.get_or_create(pk=1)` возвращает (instance, created). Created обычно False (миграция 0030 уже создала pk=1). Безопасно повторно.
3. **`FeaturedNewsSettings.delete()`** возвращает `(0, {})` — нельзя удалить (см. модель). DELETE endpoint не делаем.
4. **Permission** — `IsHvacAdminProxyAllowed` стандарт.
5. **`active_categories`** в NewsCategoriesPage скорее всего уже доступны через существующий state — переиспользуй.

---

## Формат отчёта

```
Отчёт — Wave 7 (AC-Федя)

Ветка: ac-rating/wave7 (rebased на origin/main)
Коммиты: <git log --oneline main..HEAD>

Что сделано:
- ✅ Backend: FeaturedNewsSettingsAdminView (GET + PATCH) + serializer + URL
- ✅ Backend: <N> тестов
- ✅ Frontend: sidebar entry «Категории новостей» + breadcrumbs
- ✅ Frontend: Card на NewsCategoriesPage для FeaturedNewsSettings
- ✅ Frontend: 2 service-метода в newsCategoriesService

Прогон:
- npx tsc --noEmit: ok
- npm test: ...
- pytest backend/news/: ...

Скриншоты: ...

Ключевые файлы:
- backend/news/admin_views.py (новый)
- backend/news/admin_serializers.py (новый)
- backend/news/urls.py (+1 path)
- backend/news/tests/test_admin_featured.py (новый)
- frontend/components/hvac/services/newsCategoriesService.ts (+2 метода)
- frontend/components/hvac/pages/NewsCategoriesPage.tsx (+ Card)
- frontend/components/erp/components/Layout.tsx (+ sidebar child + breadcrumb)
```
