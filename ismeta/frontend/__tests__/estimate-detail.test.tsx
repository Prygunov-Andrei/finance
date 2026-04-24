import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EstimateHeader } from "@/components/estimate/estimate-header";
import { SectionsPanel } from "@/components/estimate/sections-panel";
import { ItemsTable } from "@/components/estimate/items-table";
import type {
  Estimate,
  EstimateItem,
  EstimateSection,
} from "@/lib/api/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/estimates/est-1",
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const estimate: Estimate = {
  id: "est-1",
  workspace: "11111111-1111-1111-1111-111111111111",
  folder_name: "2026",
  name: "Вентиляция корпус А",
  status: "in_progress",
  version_number: 2,
  parent_version: null,
  version: 7,
  default_material_markup: {},
  default_work_markup: {},
  total_equipment: "0",
  total_materials: "0",
  total_works: "0",
  total_amount: "120000",
  man_hours: "0",
  profitability_percent: "0",
  advance_amount: "0",
  estimated_days: 0,
  note: "",
  created_by: null,
  created_at: "2026-04-17T10:00:00Z",
  updated_at: "2026-04-17T10:00:00Z",
};

const sections: EstimateSection[] = [
  {
    id: "sec-1",
    estimate: "est-1",
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
    estimate: "est-1",
    name: "Вентиляторы",
    sort_order: 1,
    version: 1,
    material_markup: null,
    work_markup: null,
    created_at: "",
    updated_at: "",
  },
];

const items: EstimateItem[] = [
  {
    id: "it-1",
    section: "sec-1",
    estimate: "est-1",
    row_id: "rid-1",
    sort_order: 0,
    name: "Воздуховод прямоугольный",
    unit: "м.п.",
    quantity: "42.5",
    equipment_price: "0",
    material_price: "1200",
    work_price: "180",
    equipment_total: "0",
    material_total: "51000",
    work_total: "7650",
    total: "58650",
    version: 3,
    match_source: "knowledge",
    material_markup: null,
    work_markup: null,
    tech_specs: {},
    custom_data: {},
    is_deleted: false,
    is_key_equipment: false,
    procurement_status: "none",
    man_hours: "0",
    created_at: "",
    updated_at: "",
  },
  {
    id: "it-2",
    section: "sec-1",
    estimate: "est-1",
    row_id: "rid-2",
    sort_order: 1,
    name: "Отвод 90°",
    unit: "шт",
    quantity: "8",
    equipment_price: "0",
    material_price: "650",
    work_price: "220",
    equipment_total: "0",
    material_total: "5200",
    work_total: "1760",
    total: "6960",
    version: 1,
    match_source: "unmatched",
    material_markup: null,
    work_markup: null,
    tech_specs: {},
    custom_data: {},
    is_deleted: false,
    is_key_equipment: false,
    procurement_status: "none",
    man_hours: "0",
    created_at: "",
    updated_at: "",
  },
];

describe("EstimateHeader", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("рендерит название, версию и статус-бейдж", () => {
    render(wrap(<EstimateHeader estimate={estimate} />));
    expect(screen.getByText(estimate.name)).toBeInTheDocument();
    expect(screen.getByText(`v${estimate.version_number}`)).toBeInTheDocument();
    expect(screen.getByText("В работе")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Скачать Excel/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Создать версию/i }),
    ).toBeInTheDocument();
  });
});

describe("SectionsPanel", () => {
  it("рендерит «Все разделы» и список разделов", () => {
    render(
      wrap(
        <SectionsPanel
          estimateId="est-1"
          sections={sections}
          selectedId={null}
          onSelect={vi.fn()}
        />,
      ),
    );
    expect(screen.getByText("Все разделы")).toBeInTheDocument();
    expect(screen.getByText("Воздуховоды")).toBeInTheDocument();
    expect(screen.getByText("Вентиляторы")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});

describe("ItemsTable", () => {
  it("рендерит строки и подсчитывает итоги по видимым позициям", () => {
    render(
      wrap(
        <ItemsTable
          estimateId="est-1"
          items={items}
          activeSectionId="sec-1"
          fallbackSectionId="sec-1"
        />,
      ),
    );
    expect(screen.getByText("Воздуховод прямоугольный")).toBeInTheDocument();
    expect(screen.getByText("Отвод 90°")).toBeInTheDocument();
    expect(screen.getByText("База")).toBeInTheDocument();
    expect(screen.getByText("Не подобрано")).toBeInTheDocument();
    // 58650 + 6960 = 65610
    expect(screen.getByText(/Итого:/)).toBeInTheDocument();
    expect(screen.getByText(/65\s?610/)).toBeInTheDocument();
  });

  it("показывает placeholder когда позиций нет", () => {
    render(
      wrap(
        <ItemsTable
          estimateId="est-1"
          items={[]}
          activeSectionId={null}
          fallbackSectionId={null}
        />,
      ),
    );
    expect(
      screen.getByText(/В этом разделе пока нет позиций/),
    ).toBeInTheDocument();
  });
});
