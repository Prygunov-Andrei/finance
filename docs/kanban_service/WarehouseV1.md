# Warehouse V1

Склад V1 — минимальный учет остатков через ledger движений.

## Принципы

- Есть локации (`warehouse` и `object`).
- Любая операция — это `StockMove` с линиями (`StockMoveLine`).
- Остатки вычисляются детерминированно как сумма приходов/расходов.
- Отрицательные остатки допускаются, но подсвечиваются флагом `ahhtung=true`.
- Выдача на объект = перемещение (финансовое списание не делаем на этом уровне).

## Сущности

- `kanban_warehouse.StockLocation`
- `kanban_warehouse.StockMove` (`IN`/`OUT`/`ADJUST`)
- `kanban_warehouse.StockMoveLine`

## API (V1)

Base: `/kanban-api/v1/warehouse/`

- `GET/POST locations/`
- `GET/POST moves/`
- `GET moves/balances/?location_id=<uuid>` -> `{ results: [...] }`

