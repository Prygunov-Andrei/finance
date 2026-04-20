import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { ResizableSidebar } from "@/components/ui/resizable-sidebar";

const KEY = "ismeta.test.sidebar.width";

function setup(props: Partial<Parameters<typeof ResizableSidebar>[0]> = {}) {
  return render(
    <ResizableSidebar
      storageKey={KEY}
      defaultWidth={256}
      minWidth={200}
      maxWidth={600}
      {...props}
    >
      <div data-testid="sidebar-content">Content</div>
    </ResizableSidebar>,
  );
}

function widthOf(el: HTMLElement): number {
  const raw = el.style.width;
  return Number.parseInt(raw, 10);
}

describe("ResizableSidebar", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  });

  it("SSR-safe: пустой LS → остаётся defaultWidth", () => {
    setup();
    expect(widthOf(screen.getByTestId("resizable-sidebar"))).toBe(256);
  });

  it("LS pre-set валидное значение применяется при mount", () => {
    window.localStorage.setItem(KEY, "420");
    setup();
    expect(widthOf(screen.getByTestId("resizable-sidebar"))).toBe(420);
  });

  it("LS значение вне [min, max] зажимается в диапазон", () => {
    window.localStorage.setItem(KEY, "50");
    setup();
    expect(widthOf(screen.getByTestId("resizable-sidebar"))).toBe(200);

    window.localStorage.setItem(KEY, "9999");
    setup();
    // берём последний mount
    const asides = screen.getAllByTestId("resizable-sidebar");
    expect(widthOf(asides[asides.length - 1]!)).toBe(600);
  });

  it("LS мусор (non-numeric) игнорируется, остаётся defaultWidth", () => {
    window.localStorage.setItem(KEY, "abc");
    setup();
    expect(widthOf(screen.getByTestId("resizable-sidebar"))).toBe(256);
  });

  it("handle имеет role=separator с aria-valuenow/min/max и tabIndex=0", () => {
    setup();
    const handle = screen.getByTestId("resizable-sidebar-handle");
    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-valuenow")).toBe("256");
    expect(handle.getAttribute("aria-valuemin")).toBe("200");
    expect(handle.getAttribute("aria-valuemax")).toBe("600");
    expect(handle.getAttribute("tabindex")).toBe("0");
  });

  it("keyboard: ArrowRight/Left меняют ширину на ±10, Shift — ±50", () => {
    setup();
    const handle = screen.getByTestId("resizable-sidebar-handle");
    const aside = screen.getByTestId("resizable-sidebar");

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(widthOf(aside)).toBe(266);

    fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    expect(widthOf(aside)).toBe(316);

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(widthOf(aside)).toBe(306);

    fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
    expect(widthOf(aside)).toBe(256);

    // keyup пишет в LS
    fireEvent.keyUp(handle, { key: "ArrowLeft" });
    expect(window.localStorage.getItem(KEY)).toBe("256");
  });

  it("keyboard: Home/End переходят к min/max", () => {
    setup();
    const handle = screen.getByTestId("resizable-sidebar-handle");
    const aside = screen.getByTestId("resizable-sidebar");

    fireEvent.keyDown(handle, { key: "End" });
    expect(widthOf(aside)).toBe(600);
    fireEvent.keyUp(handle, { key: "End" });
    expect(window.localStorage.getItem(KEY)).toBe("600");

    fireEvent.keyDown(handle, { key: "Home" });
    expect(widthOf(aside)).toBe(200);
    fireEvent.keyUp(handle, { key: "Home" });
    expect(window.localStorage.getItem(KEY)).toBe("200");
  });

  it("keyboard: clamping при достижении min/max", () => {
    setup();
    const handle = screen.getByTestId("resizable-sidebar-handle");
    const aside = screen.getByTestId("resizable-sidebar");

    // Идём к max через большие шаги
    for (let i = 0; i < 20; i++) {
      fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    }
    expect(widthOf(aside)).toBe(600);

    // Идём к min
    for (let i = 0; i < 20; i++) {
      fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
    }
    expect(widthOf(aside)).toBe(200);
  });

  it("pointer drag: mousemove меняет ширину, mouseup пишет в LS и снимает body.userSelect", () => {
    setup();
    const handle = screen.getByTestId("resizable-sidebar-handle");
    const aside = screen.getByTestId("resizable-sidebar");

    fireEvent.pointerDown(handle, {
      clientX: 256,
      button: 0,
      pointerType: "mouse",
    });
    expect(document.body.style.userSelect).toBe("none");
    expect(document.body.style.cursor).toBe("col-resize");

    // PointerEvent — document listener, эмулируем через document.dispatchEvent
    act(() => {
      document.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 356 }),
      );
    });
    expect(widthOf(aside)).toBe(356);

    act(() => {
      document.dispatchEvent(new PointerEvent("pointerup"));
    });
    expect(window.localStorage.getItem(KEY)).toBe("356");
    expect(document.body.style.userSelect).toBe("");
    expect(document.body.style.cursor).toBe("");
  });

  it("pointer drag: зажимается в min/max", () => {
    setup();
    const handle = screen.getByTestId("resizable-sidebar-handle");
    const aside = screen.getByTestId("resizable-sidebar");

    fireEvent.pointerDown(handle, {
      clientX: 256,
      button: 0,
      pointerType: "mouse",
    });
    // Тащим далеко вправо — ограничение max=600
    act(() => {
      document.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 2000 }),
      );
    });
    expect(widthOf(aside)).toBe(600);

    // Тащим далеко влево — ограничение min=200
    act(() => {
      document.dispatchEvent(
        new PointerEvent("pointermove", { clientX: -2000 }),
      );
    });
    expect(widthOf(aside)).toBe(200);

    act(() => {
      document.dispatchEvent(new PointerEvent("pointerup"));
    });
    expect(window.localStorage.getItem(KEY)).toBe("200");
  });

  it("LS во время drag не пишется на каждое move (только на mouseup)", () => {
    window.localStorage.setItem(KEY, "300");
    setup();
    const handle = screen.getByTestId("resizable-sidebar-handle");

    fireEvent.pointerDown(handle, {
      clientX: 100,
      button: 0,
      pointerType: "mouse",
    });
    act(() => {
      document.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 150 }),
      );
      document.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 200 }),
      );
    });
    // LS всё ещё содержит изначальное значение "300"
    expect(window.localStorage.getItem(KEY)).toBe("300");
    act(() => {
      document.dispatchEvent(new PointerEvent("pointerup"));
    });
    // После pointerup — обновлено
    expect(window.localStorage.getItem(KEY)).not.toBe("300");
  });

  it("focus outline: handle имеет focus-visible outline-primary + offset-0 + bg-подсветку (UI-03)", () => {
    setup();
    const handle = screen.getByTestId("resizable-sidebar-handle");
    // handle 6px (w-1.5) — чтобы focus-ring 2px читался издалека.
    expect(handle.className).toContain("w-1.5");
    expect(handle.className).toContain("focus-visible:outline");
    expect(handle.className).toContain("focus-visible:outline-2");
    expect(handle.className).toContain("focus-visible:outline-primary");
    // offset-0 — outline поверх границы handle, не клипится overflow-hidden
    // и не прячется внутри.
    expect(handle.className).toContain("focus-visible:outline-offset-0");
    // bg-primary/60 при focus-visible — дополнительная подсветка.
    expect(handle.className).toContain("focus-visible:bg-primary/60");
    // focus:outline-none — оставлен, чтобы браузер не рисовал default outline
    // поверх наших focus-visible стилей.
    expect(handle.className).toContain("focus:outline-none");
  });

  it("pointerup пишет LS один раз (не двойной persist из setState-updater)", () => {
    // Регрессионный тест для замечания ревьюера: раньше persist жил
    // внутри setState((w) => {persist(w); return w;}) updater, который
    // React мог вызвать дважды в strict mode → двойная запись. Фикс —
    // читать widthRef.current напрямую в onPointerUp. Здесь проверяем
    // через LS-наблюдатель: считаем сколько раз за один pointerup
    // значение меняется.
    setup();
    const handle = screen.getByTestId("resizable-sidebar-handle");

    // Выставляем известное стартовое значение в LS
    window.localStorage.setItem(KEY, "256");
    let writesAfterUp = 0;
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (k === KEY) writesAfterUp++;
      return originalSet.call(this, k, v);
    };

    try {
      // Сбросить счётчик (выставление "256" тоже посчиталось)
      writesAfterUp = 0;

      fireEvent.pointerDown(handle, {
        clientX: 100,
        button: 0,
        pointerType: "mouse",
      });
      act(() => {
        document.dispatchEvent(
          new PointerEvent("pointermove", { clientX: 180 }),
        );
      });
      act(() => {
        document.dispatchEvent(new PointerEvent("pointerup"));
      });

      expect(writesAfterUp).toBe(1);
    } finally {
      Storage.prototype.setItem = originalSet;
    }
  });
});
