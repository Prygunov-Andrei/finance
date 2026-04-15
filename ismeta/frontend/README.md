# ISMeta frontend

Next.js 15 приложение ISMeta. Скелет создан в эпике E1, наполняется по эпикам E9, E10, E11.

## Быстрый старт

```bash
# Из каталога ismeta/
make ismeta-frontend-install
make ismeta-frontend-run
```

Откроется на `http://localhost:3001`.

## Структура (целевая)

```
frontend/
├── package.json
├── next.config.js
├── tsconfig.json
├── tailwind.config.ts
├── .env.example
├── app/                          # Next.js app router
│   ├── layout.tsx
│   ├── page.tsx
│   ├── login/
│   └── estimates/
│       ├── page.tsx              # список смет
│       └── [id]/
│           └── page.tsx          # детали сметы (E9)
├── components/
│   ├── ui/                       # shadcn компоненты
│   ├── estimate-detail/          # E9
│   ├── items-editor/             # E9
│   ├── work-matching/            # E10
│   ├── excel-import/             # E7
│   └── chat-panel/               # E8 (MVP-чат)
├── lib/
│   ├── api/
│   │   ├── client.ts
│   │   ├── services/
│   │   │   └── estimates.ts
│   │   ├── types/
│   │   │   └── estimates.ts
│   │   └── estimate-api-context.tsx
│   └── utils.ts
├── hooks/
├── widget/                       # E11: сборка @ismeta/widget
│   ├── index.ts
│   ├── EstimateWidget.tsx
│   └── tsup.config.ts
└── tests/
    ├── unit/
    └── e2e/                      # E21
```

## Dev-заметки

- Next.js 15 (stable) — не 16 (bleeding edge).
- TypeScript strict mode.
- Стек: TanStack Query + TanStack Table + TanStack Virtual, Shadcn UI.
- API-клиент инжектится через `EstimateApiProvider` — один и тот же компонент работает и в standalone, и в widget.
- Темизация `next-themes`, тёмная тема — опция.

## Ссылки

- [`../specs/02-api-contracts.md §1`](../specs/02-api-contracts.md) — ISMeta Public API, с которым работает фронт.
- [`../specs/09-dev-setup.md`](../specs/09-dev-setup.md) — настройка локальной разработки.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — правила контрибьюции, включая frontend code style.
