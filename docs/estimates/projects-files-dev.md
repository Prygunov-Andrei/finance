# Проекты ПТО: Документация разработчика

## Модели

### ProjectFileType (`estimates.models`)
Справочник типов файлов проектной документации.

| Поле | Тип | Описание |
|------|-----|----------|
| name | CharField(100) | Название типа |
| code | CharField(50), unique | Уникальный код |
| sort_order | PositiveIntegerField | Порядок сортировки |
| is_active | BooleanField | Активен (для фильтрации в UI) |

Seed-данные (миграция 0008): `full_project`, `graphics`, `specification`, `technique`.

### ProjectFile (`estimates.models`)
Файл, прикреплённый к проекту. Заменяет устаревшее поле `Project.file`.

| Поле | Тип | Описание |
|------|-----|----------|
| project | FK(Project), CASCADE | Проект |
| file | FileField | Файл (path: `projects/{object_id}/{cipher}/files/{filename}`) |
| file_type | FK(ProjectFileType), PROTECT | Тип файла |
| title | CharField(255), blank | Пользовательское название |
| original_filename | CharField(255) | Оригинальное имя файла (заполняется автоматически) |
| uploaded_by | FK(User), SET_NULL | Кто загрузил (заполняется в perform_create) |

## API Endpoints

Все endpoint'ы под prefix `/api/erp/` (через estimates router).

### Project File Types
```
GET    /project-file-types/          # Список (фильтр: ?is_active=true, ?search=...)
POST   /project-file-types/          # Создать
PATCH  /project-file-types/{id}/     # Обновить
DELETE /project-file-types/{id}/     # Удалить (PROTECT если есть привязанные файлы)
```

### Project Files
```
GET    /project-files/?project={id}  # Список файлов проекта
POST   /project-files/               # Загрузить (FormData: project, file, file_type, title?)
PATCH  /project-files/{id}/          # Обновить (title, file_type)
DELETE /project-files/{id}/          # Удалить
```

### Project List & Detail
`GET /projects/` и `GET /projects/{id}/` включают поле `project_files[]` с вложенными данными файлов.

### Файлы проектов в деталях сметы

`GET /estimates/{id}/` включает `project_files[]` для каждого проекта в поле `projects`:

```json
{
  "projects": [
    {
      "id": 1,
      "cipher": "ПР-2025-001",
      "name": "Вентиляция",
      "file": "http://.../project.zip",
      "project_files": [
        {
          "id": 5,
          "file": "http://.../spec.xlsx",
          "file_type": 3,
          "file_type_name": "Спецификация",
          "file_type_code": "specification",
          "title": "",
          "original_filename": "spec.xlsx"
        }
      ]
    }
  ]
}
```

### Импорт из файла проекта
```
POST   /estimate-items/import-project-file/   # Импорт строк из ProjectFile
```

**Request body (JSON):**

| Поле | Тип | Описание |
|------|-----|----------|
| estimate_id | number | ID сметы |
| project_file_ids | number[] | Массив ID файлов проекта (ProjectFile) |
| project_file_id | number | ID одного файла (обратная совместимость) |
| preview | string | `"true"` для предпросмотра без сохранения |

При передаче нескольких файлов строки из всех файлов объединяются в один preview. Каждая строка содержит поле `source_file` с именем исходного файла.

**Валидация:**
- ProjectFile должен принадлежать проекту, связанному со сметой (M2M)
- Поддерживаемые форматы: xlsx, xls, pdf
- Используется тот же `EstimateImportService` что и для загрузки с диска

**Response (preview=true):** `EstimateImportPreview` (rows, sections, total_rows, confidence)

**Response (preview=false):** массив созданных `EstimateItem[]`

### Async-импорт PDF из файла проекта
```
POST   /estimate-items/import-project-file-pdf/   # Async-импорт PDF через Celery
```

**Request body (JSON):**

| Поле | Тип | Описание |
|------|-----|----------|
| estimate_id | number | ID сметы |
| project_file_ids | number[] | Массив ID файлов проекта (только PDF) |

**Логика:**
1. Валидация: смета существует, файлы существуют, проекты привязаны к смете
2. Чтение PDF-файлов из storage, объединение через PyMuPDF
3. Создание import session в Redis (`create_import_session`)
4. Запуск Celery task `process_estimate_pdf_pages`
5. Возврат `{ session_id, total_pages }` с HTTP 202

**Дальнейший flow:** идентичен прямому PDF-upload — фронтенд поллит `/import-progress/{session_id}/`, может отменить через `/import-cancel/{session_id}/`.

**Зачем отдельный endpoint:** Синхронный `import-project-file` вызывает LLM на все страницы разом (до 15), что занимает 60-120+ сек и таймаутится. Async endpoint обрабатывает постранично через Celery без ограничения по времени.

**Response (HTTP 202):**
```json
{
  "session_id": "a1b2c3d4e5f6g7h8",
  "total_pages": 15,
  "warnings": ["Файл «spec.xlsx»: ожидается PDF, получен .xlsx"]
}
```

## Миграция данных

Миграция `0008_projectfiletype_projectfile_and_file_optional`:
1. Создаёт таблицу `estimates_projectfiletype` + seed-данные
2. Делает `Project.file` optional (blank=True, null=True)
3. Создаёт таблицу `estimates_projectfile`
4. RunPython: для каждого `Project` с непустым `file` создаётся `ProjectFile` с типом "Полный проект"

Файлы физически не перемещаются — `ProjectFile.file` указывает на тот же путь в storage.

**Откат**: `python manage.py migrate estimates 0007` (удаляет таблицы, Project.file возвращается обязательным).

## Frontend компоненты

| Компонент | Путь | Описание |
|-----------|------|----------|
| Projects.tsx | `components/erp/components/estimates/` | Список + форма создания с multi-file и quick object |
| ProjectDetail.tsx | `components/erp/components/estimates/` | Таблица файлов, загрузка, удаление |
| ProjectFileTypesTab.tsx | `components/erp/components/settings/` | CRUD справочника типов |
| QuickCreateObjectDialog.tsx | `components/erp/components/kanban/` | Переиспользуется из канбана КП |
| EstimateInfoTab.tsx | `components/erp/components/estimates/estimate-detail/` | Отображение файлов проектов в деталях сметы |
| EstimateImportDialog.tsx | `components/erp/components/estimates/` | Импорт строк + выбор из файлов проекта (спецификации) |

### API service
`frontend/lib/api/services/estimates.ts` — методы `getProjectFileTypes`, `createProjectFileType`, `updateProjectFileType`, `deleteProjectFileType`, `getProjectFiles`, `uploadProjectFile`, `updateProjectFile`, `deleteProjectFile`, `importFromProjectFilePreview`, `startProjectFilePdfImport`.

### Хук
`frontend/hooks/useReferenceData.ts` — `useProjectFileTypes(onlyActive?)` с кешированием.

## Тесты

Backend тесты: `backend/estimates/tests/`
- `test_models.py`: `ProjectFileTypeTests`, `ProjectFileTests`
- `test_api.py`: `ProjectFileTypeAPITests`, `ProjectFileAPITests`, `EstimateProjectFilesAPITests`
