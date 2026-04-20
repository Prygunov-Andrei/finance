import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EmptyEstimatesState } from "@/app/estimates/empty-state";
import { EstimateHeader } from "@/components/estimate/estimate-header";
import { SectionsPanel } from "@/components/estimate/sections-panel";
import type { Estimate, EstimateSection } from "@/lib/api/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/estimates",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function makeEstimate(overrides: Partial<Estimate> = {}): Estimate {
  return {
    id: "e1",
    workspace: "11111111-1111-1111-1111-111111111111",
    folder_name: "",
    name: "Вентиляция",
    status: "in_progress",
    version_number: 1,
    parent_version: null,
    version: 1,
    default_material_markup: {},
    default_work_markup: {},
    total_equipment: "0",
    total_materials: "0",
    total_works: "0",
    total_amount: "0",
    man_hours: "0",
    profitability_percent: "0",
    advance_amount: "0",
    estimated_days: 0,
    created_by: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

const SPACE = /[\s\u00a0\u202f]/g;
const stripSpaces = (s: string) => s.replace(SPACE, "");

describe("EmptyEstimatesState — 2 кнопки", () => {
  it("рендерит обе кнопки: «Новая смета» и «Загрузить Excel»", () => {
    render(wrap(<EmptyEstimatesState />));
    expect(screen.getByTestId("estimates-empty-state")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Новая смета/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Загрузить Excel/ }),
    ).toBeInTheDocument();
  });

  it("«Загрузить Excel» открывает import-new-dialog", () => {
    render(wrap(<EmptyEstimatesState />));
    fireEvent.click(screen.getByTestId("import-new-trigger"));
    expect(screen.getByTestId("import-new-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("import-new-dropzone")).toBeInTheDocument();
  });
});

describe("EstimateHeader — responsive actions", () => {
  it("рендерит и desktop-ряд кнопок, и mobile-dropdown (toggling через CSS)", () => {
    render(wrap(<EstimateHeader estimate={makeEstimate()} />));
    const desktop = screen.getByTestId("header-actions-desktop");
    const mobile = screen.getByTestId("header-actions-mobile");

    // Desktop скрыт на мобильном (hidden), mobile скрыт на lg (lg:hidden)
    expect(desktop.className).toContain("hidden");
    expect(desktop.className).toContain("lg:flex");
    expect(mobile.className).toContain("lg:hidden");
  });

  it("mobile-dropdown имеет trigger «Действия» с MoreHorizontal", () => {
    render(wrap(<EstimateHeader estimate={makeEstimate()} />));
    const mobile = screen.getByTestId("header-actions-mobile");
    const trigger = within(mobile).getByRole("button", {
      name: /Действия со сметой/,
    });
    expect(trigger).toBeInTheDocument();
  });

  it("desktop-ряд содержит все 5 обязательных кнопок (без onOpen* колбэков)", () => {
    render(wrap(<EstimateHeader estimate={makeEstimate()} />));
    const desktop = screen.getByTestId("header-actions-desktop");
    expect(
      within(desktop).getByRole("button", { name: /Подобрать работы/ }),
    ).toBeInTheDocument();
    expect(
      within(desktop).getByRole("button", { name: /Скачать Excel/ }),
    ).toBeInTheDocument();
    expect(
      within(desktop).getByRole("button", { name: /Создать версию/ }),
    ).toBeInTheDocument();
    expect(
      within(desktop).getByRole("button", { name: /Архивировать/ }),
    ).toBeInTheDocument();
  });
});

describe("SectionsPanel — subtotals", () => {
  const sections: EstimateSection[] = [
    {
      id: "sec-1",
      estimate: "e1",
      name: "Воздуховоды",
      sort_order: 0,
      version: 1,
      material_markup: null,
      work_markup: null,
      created_at: "",
      updated_at: "",
    },
    {
      id: "sec-2",
      estimate: "e1",
      name: "Вентиляторы",
      sort_order: 1,
      version: 1,
      material_markup: null,
      work_markup: null,
      created_at: "",
      updated_at: "",
    },
  ];

  it("рендерит subtotal рядом с каждым разделом", () => {
    render(
      wrap(
        <SectionsPanel
          estimateId="e1"
          sections={sections}
          selectedId={null}
          onSelect={vi.fn()}
          subtotals={{ "sec-1": 120000, "sec-2": 45000 }}
          totalAll={165000}
        />,
      ),
    );

    const sec1 = screen.getByTestId("section-subtotal-sec-1");
    expect(stripSpaces(sec1.textContent ?? "")).toContain("120000,00₽");

    const sec2 = screen.getByTestId("section-subtotal-sec-2");
    expect(stripSpaces(sec2.textContent ?? "")).toContain("45000,00₽");

    const all = screen.getByTestId("section-subtotal-all");
    expect(stripSpaces(all.textContent ?? "")).toContain("165000,00₽");
  });

  it("без subtotals проп — subtotal-элементы не рендерятся", () => {
    render(
      wrap(
        <SectionsPanel
          estimateId="e1"
          sections={sections}
          selectedId={null}
          onSelect={vi.fn()}
        />,
      ),
    );
    expect(screen.queryByTestId("section-subtotal-sec-1")).toBeNull();
    expect(screen.queryByTestId("section-subtotal-all")).toBeNull();
  });

  it("пропускает subtotal для раздела, которого нет в map", () => {
    render(
      wrap(
        <SectionsPanel
          estimateId="e1"
          sections={sections}
          selectedId={null}
          onSelect={vi.fn()}
          subtotals={{ "sec-1": 100 }}
          totalAll={100}
        />,
      ),
    );
    expect(screen.getByTestId("section-subtotal-sec-1")).toBeInTheDocument();
    expect(screen.queryByTestId("section-subtotal-sec-2")).toBeNull();
  });
});
