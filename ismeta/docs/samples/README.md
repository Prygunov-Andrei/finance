# Samples — примеры данных

Реальные (но обезличенные) примеры данных по всем ключевым контрактам. Разработчики опираются на них при реализации, QA — при написании тестов.

## Содержимое

| Файл | Формат | Покрывает |
|---|---|---|
| [`recognition-response.json`](./recognition-response.json) | JSON | результат сервиса распознавания (3-страничная спецификация на 20 позиций) |
| [`snapshot-to-erp.json`](./snapshot-to-erp.json) | JSON | snapshot сметы, передаваемый в ERP |
| [`webhook-events.jsonl`](./webhook-events.jsonl) | JSON Lines | примеры всех 8 типов webhook-событий |
| [`agent-chat-transcript.md`](./agent-chat-transcript.md) | Markdown | пример диалога сметчика с LLM-агентом |
| [`er-diagram.mmd`](./er-diagram.mmd) | Mermaid | ER-диаграмма БД ISMeta |
| [`er-diagram.dbml`](./er-diagram.dbml) | DBML | та же диаграмма для [dbdiagram.io](https://dbdiagram.io) |
| [`sample-estimate-data.json`](./sample-estimate-data.json) | JSON | данные для генерации sample-estimate.xlsx |
| [`generate-sample-xlsx.py`](./generate-sample-xlsx.py) | Python | скрипт генерации sample-estimate.xlsx из JSON |

## Как пользоваться

- При написании кода — скопируй нужный JSON как fixture в своих тестах.
- При review PR — убедись, что реальный ответ сервиса соответствует этому sample.
- При изменении контракта — сначала обнови sample, потом код, потом spec-документ.

## Как сгенерировать sample-estimate.xlsx

```bash
pip install openpyxl
cd ismeta/docs/samples
python generate-sample-xlsx.py
# → sample-estimate.xlsx появится здесь
```

Файл не коммитится в git — он регенерируется из `sample-estimate-data.json`.

## Принципы samples

1. Покрывают типичный happy-path сценарий. Крайние случаи — отдельно в `tests/fixtures/`.
2. Анонимизированы (ни одного реального контрагента, объекта, имени).
3. Согласованы между собой: snapshot ссылается на те же IDs, что и recognition-response.
4. Актуальны: при изменении контракта — правятся одновременно со спецификацией.
