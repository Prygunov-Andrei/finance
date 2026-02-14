# File Registry (V1)

Цель: единый универсальный слой файлов без копий между ERP и kanban.

## Концепция

- Бинарник хранится в MinIO один раз.
- В БД хранится запись `FileObject` (реестр) с `sha256` и метаданными.
- Все сущности (кейсы снабжения, первичка, фото, задачи) хранят только `file_id` и мета-привязку.

## Хранение в MinIO

- Bucket: `files`
- Object key: `sha256/<first2>/<sha256>`
- Публичный доступ выключен. Доступ только по presigned URL с коротким TTL.

## Модель данных

`kanban_files.FileObject`:
- `sha256` (unique) — ключ дедупликации
- `size_bytes`, `mime_type`, `original_filename`
- `bucket`, `object_key`
- `status`: `uploading` -> `ready`
- `created_by_user_id`, `created_by_username` (для ACL/audit)

## API (V1)

Base: `/kanban-api/v1/`

- `POST /files/init/` — вернуть presigned PUT URL или существующий `file_id` (дедуп)
- `POST /files/finalize/` — проверить наличие объекта и перевести `status=ready`
- `POST /files/{file_id}/download_url/` — вернуть presigned GET URL (ACL: владелец или service-token)

## ACL (V1)

- По умолчанию: download доступен владельцу (`created_by_user_id`) или сервисному токену.
- Расширение в V2: доступ по связям (board/card roles, watchers, бухгалтерия).

