# ADR-0011. Встраивание в ERP через npm-пакет `@ismeta/widget`

- **Статус:** Accepted
- **Дата:** 2026-04-15

## Контекст

Сметчик работает в UI ERP. Надо дать ему сметный функционал ISMeta прямо там. Варианты:
1. **iframe** от ISMeta в ERP-странице.
2. **npm-пакет `@ismeta/widget`** — React-компоненты, публикуются в приватный npm, подключаются в ERP-frontend.
3. **Микрофронтенд** — Module Federation, Single-SPA.

## Решение

npm-пакет `@ismeta/widget`.

## Обоснование

- **iframe** — изолирует полностью, но делает интеграцию корявой: разные домены, cookie, cross-origin, нет общего UI state, visual seam.
- **Module Federation** — современный стандарт, но heavy-setup, требует синхронизации версий React, усложняет CI.
- **npm-пакет** — стандарт для React-компонентов. Уже заложено в `frontend/lib/api/estimate-api-context.tsx` через `EstimateApiProvider`. Мы просто экспортируем эти компоненты как отдельный пакет, принимающий API-клиент через props.

## Реализация

- Отдельная папка `ismeta/frontend/widget/` с `tsup.config.ts` для сборки.
- `package.json` с полями `exports`, `types`, `peerDependencies: react, react-dom, @tanstack/react-query`.
- ERP-frontend подключает `@ismeta/widget`, предоставляет `EstimateApiProvider` с нужным baseURL и JWT.
- Версионируется semver.

## Последствия

- **Плюс:** естественная интеграция, общий state React, переиспользование без копипаста.
- **Плюс:** тот же пакет подключается в публичный сайт Августа.
- **Минус:** синхронизация версий React между ERP и ISMeta frontend. Смягчается через peerDependencies.
- **Минус:** breaking changes в компонентах требуют bump major версии.

## Связанные документы

- [`CONCEPT.md §4.2`](../../CONCEPT.md) — стек frontend'а.
- [`specs/02-api-contracts.md §1`](../../specs/02-api-contracts.md) — API, с которым работает виджет.
