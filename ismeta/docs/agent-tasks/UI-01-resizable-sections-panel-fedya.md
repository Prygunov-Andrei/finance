# ТЗ для Феди — UI-01 Resizable sections panel

**Кому:** Федя (frontend, Next.js/React).
**Ветка:** `ismeta/ui-resizable-panels`.
**Базовая ветка:** `main`.
**Статус:** готово к работе.
**Параллельно:** Петя делает Recognition Service (`recognition/01-...`) — они не пересекаются.

---

## Контекст

ISMeta — продукт для создания смет. Прод: `ismeta.hvac-info.com`. Разрабатывается в `ismeta/frontend/` (Next.js 16 + React + TailwindCSS + shadcn/ui).

Главный экран — редактор сметы: `ismeta/frontend/app/estimates/[id]/page.tsx`. Слева — sidebar со списком разделов (`SectionsPanel`), справа — таблица строк (`ItemsTable`).

### Замечание из UI-BACKLOG

Источник: `ismeta/docs/UI-BACKLOG.md` high priority #1.

> Sidebar разделов (`w-64` = 256px) — слишком узкий для длинных названий. Нужно: drag-handle на правой границе, resize мышкой. Состояние ширины сохранять в localStorage.

Жаловался Андрей (PO) — названия разделов типа «Система кондиционирования выставочного зала» обрезаются, а расширить нельзя.

### Файлы, которые трогаешь

- `ismeta/frontend/components/estimate/sections-panel.tsx` — сам sidebar. Сейчас `<aside className="flex w-64 shrink-0 flex-col border-r bg-card">` на line 108.
- Скорее всего сделаешь новый компонент-обёртку `components/ui/resizable-sidebar.tsx` (shadcn-style UI primitive) и используешь его вокруг `SectionsPanel` — либо заменишь `aside` внутри, на твой выбор (см. §Решение).

### Что НЕ трогаешь

- Логику `SectionsPanel` (CRUD разделов) — только контейнер.
- Другие экраны (список смет, страница настроек и т.д.).
- Backend.

---

## Задача

Сделать ширину sidebar разделов изменяемой пользователем: перетаскивание вертикальной полосы на правой границе, сохранение в `localStorage`.

### Требования

1. **Drag handle** — тонкая вертикальная полоса (2-4px) на правой границе sidebar. Cursor `col-resize` при hover. Видно ненавязчиво (чуть темнее фона) — акцент при hover.
2. **Resize мышкой:**
   - `onMouseDown` на handle → фиксируем стартовую позицию и ширину;
   - `document` слушатели `mousemove` и `mouseup` → обновляем ширину;
   - `body { user-select: none; cursor: col-resize }` во время drag (чтобы не выделялся текст);
   - после `mouseup` слушатели снимаются.
3. **Ограничения:**
   - `min-width: 200px` (меньше нет смысла);
   - `max-width: 600px` (больше — наоборот, мешает таблице).
4. **Persistence:**
   - ключ `localStorage`: `ismeta.sidebar.sections.width`;
   - сохраняем значение при каждом `mouseup` (а не на каждый mousemove — иначе спам в LS);
   - при монтировании читаем значение, если в пределах [200, 600] — применяем, иначе default 256.
5. **SSR-safe:** Next.js, начальный рендер без `window`. Используй `useEffect` для чтения LS, начальное значение `256` (текущее `w-64`).
6. **Доступность:**
   - `aria-label="Изменить ширину панели разделов"` на handle;
   - handle реагирует на стрелки клавиатуры при фокусе: `←` -10px, `→` +10px (`Shift` → ±50px);
   - `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.
7. **Touch-поддержка** — `onTouchStart/Move/End` параллельно мышиным (если без усилий). Не MVP, но приветствуется.
8. **Не ломает мобильный layout**: если viewport < 768px, sidebar по-прежнему коллапсит (если где-то есть такая логика) — не регрессируй. Если её нет — окей, но сохрани минимальную адекватность на узких экранах (`max-w: calc(100vw - 200px)`).

### Решение (рекомендация)

Сделай **отдельный reusable компонент** `components/ui/resizable-sidebar.tsx`:

```tsx
interface ResizableSidebarProps {
  children: React.ReactNode;
  storageKey: string;
  defaultWidth?: number;   // 256
  minWidth?: number;       // 200
  maxWidth?: number;       // 600
  side?: "left" | "right"; // handle где — справа у левого sidebar
  className?: string;
}
```

И примени в `sections-panel.tsx` (line 108) — оберни `<aside>` в `<ResizableSidebar>` либо перенеси class'ы в обёртку. Главное чтобы SectionsPanel сам оставался переиспользуемым.

**Библиотеку `react-resizable-panels` использовать НЕ обязательно** — собственная реализация на ~80 строк даст нам полный контроль и меньше зависимостей. Если ты считаешь, что библиотека лучше — обоснуй в отчёте (bundle size, edge cases), иначе пиши своё.

---

## Приёмочные критерии

1. **Ручная проверка** (`npm run dev` → открыть любую смету):
   - на правой границе sidebar видна тонкая вертикальная полоса, cursor `col-resize` при hover;
   - зажал → потянул вправо → ширина увеличилась, таблица справа ужалась;
   - отпустил → ширина сохранилась;
   - F5 → та же ширина после перезагрузки;
   - перетащил за пределы диапазона — стопится на min/max;
   - Tab фокусирует handle, стрелки меняют ширину, `Shift+стрелки` меняет на 50px;
2. **Тесты (`vitest`):**
   - unit на `ResizableSidebar`: читает/пишет LS, применяет min/max, рендерит handle с правильными aria;
   - тест клавиатурного управления;
   - тест SSR (монтирование без `window`);
   - всего ≥ 4 новых тестов.
3. **Визуально:**
   - handle не перекрывает контент (border-r остаётся);
   - hover-состояние handle — чуть ярче;
   - drag не вызывает flicker/jitter (используй `requestAnimationFrame` или `useLayoutEffect` если нужно);
4. **Регрессий нет:**
   - `npx tsc --noEmit` — чисто;
   - `npm test` — зелёный;
   - `npm run lint` — без новых ошибок;
   - существующие snapshot-тесты на `sections-panel` не сломались (или обновлены с объяснением).

---

## Ограничения

- **Никакого** глобального state-менеджера (Zustand/Redux) для этого — локальный useState + LS достаточно.
- **Никаких** новых зависимостей без обоснования. Tailwind/shadcn — допустимо.
- **Не меняй** API `SectionsPanel` — добавишь обёртку, не ломай пропсы.
- **Цвета/размеры** — через Tailwind классы и существующие design tokens (`border`, `muted`, `accent`). Без inline `style` кроме `style={{ width }}` для динамической ширины.
- **Не добавляй** анимации при drag — это раздражает. При программном изменении (стрелки) — допустимо `transition-[width]` 100ms.

---

## Подсказки

- Глобальный `document` listener — в `useEffect` с cleanup на unmount + снятие при `mouseup`.
- LS write throttling — на `mouseup`, не на каждом `mousemove`.
- `document.body.style.cursor = "col-resize"` и `userSelect = "none"` во время drag. НЕ забудь вернуть в исходное после `mouseup`.
- Для keyboard — `preventDefault` на стрелках, чтобы не скроллить страницу.

---

## Формат отчёта

```
Ветка: ismeta/ui-resizable-panels
Коммиты: <hash-ы>

Что сделано:
- Новый компонент ResizableSidebar (N строк)
- Интеграция в SectionsPanel
- Тесты: N новых

Решения:
- Библиотеку react-resizable-panels не использовал, обоснование: ...
- Touch: сделал / не сделал, почему: ...

Проверки:
- tsc: clean
- vitest: N passed (прирост +M)
- lint: clean
- ручная в браузере: drag / keyboard / LS / F5 / min-max — всё работает

Видео/скриншоты: <если записывал>

Вопросы/сомнения:
- <если есть>
```

---

## Чек-лист перед отчётом

- [ ] Drag мышкой работает плавно;
- [ ] Клавиатура (Tab, стрелки, Shift+стрелки) работает;
- [ ] LS сохраняет и читает, F5 сохраняет ширину;
- [ ] Min/max не выходят за границы;
- [ ] `tsc`, `vitest`, `lint` чисто;
- [ ] Никаких новых зависимостей (либо обоснована);
- [ ] Ручная проверка в Chrome + Safari (drag и клавиатура);
- [ ] Существующие тесты `SectionsPanel` не сломались.

---

**Вопросы задавай до начала.** Если видишь что логика SectionsPanel страдает от обёртки — пиши, пересмотрим.
