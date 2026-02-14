# SupplyBoard (V1)

SupplyBoard — доска снабжения. Карточка = `SupplyCase` (один запрос), внутри может быть несколько счетов и несколько частичных поставок.

## Сущности

- `kanban_core.Card(type=supply_case)` — базовая карточка процесса.
- `kanban_supply.SupplyCase` — снабженческий слой:
  - `erp_object_id`, `erp_contract_id`
  - `supplier_label` (опционально)
- `kanban_supply.InvoiceRef` — привязка к счету ERP (0..N на кейс)
- `kanban_supply.DeliveryBatch` — партия поставки (частичные поставки, 0..N на кейс)

## Вложения и “первичка”

- Файлы хранятся в `File Registry` (MinIO, без копий).
- `kanban_core.Attachment` привязывается к карточке и может быть перепривязан к:
  - `invoice_ref_id`
  - `delivery_batch_id`

Это позволяет:
- сначала прикрепить документы к кейсу,
- затем перелинковать к конкретной поставке/счёту без повторной загрузки.

## API (V1)

Base: `/kanban-api/v1/`

- `POST /supply/cases/`
- `POST /supply/invoice_refs/`
- `POST /supply/deliveries/`
- `POST /attachments/{id}/relink/`

