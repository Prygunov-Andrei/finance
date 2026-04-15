# Mock-серверы для локальной разработки

Заглушки для внешних сервисов. Позволяют работать с ISMeta, когда реальные соседи ещё не готовы (в процессе эпиков E13, E15) или недоступны локально.

## Recognition mock (`recognition/`)

Имитирует сервис распознавания документов.
- Запуск: `make mock-recognition` (порт 5001).
- Принимает multipart-файл, возвращает фиксированный JSON через 2 секунды.
- Фикстуры — в `recognition/fixtures/`.
- Подробнее в `recognition/README.md`.

## ERP catalog mock (`erp-catalog/`)

Имитирует API каталога ERP (Product, WorkItem, ProductPriceHistory).
- Запуск: `make mock-erp-catalog` (порт 5002).
- Данные — снимок из реальной прод-БД (анонимизированный): 100 товаров, 238 работ, 5 грейдов, история цен, контрагенты, объекты.
- Подробнее в `erp-catalog/README.md`.

## Как переключаться между real и mock

В `.env.local` backend ISMeta:

```bash
# Реальный ERP
ERP_CATALOG_BASE_URL=http://localhost:8000
RECOGNITION_BASE_URL=http://localhost:8000

# Mock
ERP_CATALOG_BASE_URL=http://localhost:5002
RECOGNITION_BASE_URL=http://localhost:5001
```

## Когда использовать mock

- Нет доступа к ERP (VPN, сеть, офис).
- ERP-команда ещё не закрыла E13 (catalog API) или E15 (recognition).
- Отладка конкретного флоу с контролируемыми ответами.
- Прогон cassette-тестов и golden set (детерминированные данные).

## Когда НЕ использовать mock

- Приёмка MVP (должен быть реальный ERP).
- Интеграционные pact-тесты (это и есть проверка контракта с реальным).
- Production, обязательно.

## Ограничения

- Mock не отражает rate limits и throttling реального ERP.
- Mock не валидирует авторизацию (любой токен принимает).
- Mock не проверяет webhook-подписи.

Эти ограничения сознательные: mock — инструмент для скорости разработки, а не для полноценного тестирования.
