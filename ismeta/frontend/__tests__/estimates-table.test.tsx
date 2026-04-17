import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EstimatesTable } from "@/app/estimates/estimates-table";
import type { EstimateListItem } from "@/lib/api/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const fixtures: EstimateListItem[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Вентиляция корпус А",
    status: "draft",
    folder_name: "2026 / ТЦ Атриум",
    version_number: 1,
    total_equipment: "0",
    total_materials: "0",
    total_works: "0",
    total_amount: "1250000",
    man_hours: "0",
    updated_at: "2026-04-17T10:00:00Z",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Кондиционирование серверной",
    status: "ready",
    folder_name: "",
    version_number: 3,
    total_equipment: "0",
    total_materials: "0",
    total_works: "0",
    total_amount: "420000",
    man_hours: "0",
    updated_at: "2026-04-15T12:00:00Z",
  },
];

describe("EstimatesTable", () => {
  it("рендерит названия смет и статусные бейджи", () => {
    render(wrap(<EstimatesTable data={fixtures} />));

    expect(screen.getByText("Вентиляция корпус А")).toBeInTheDocument();
    expect(screen.getByText("Кондиционирование серверной")).toBeInTheDocument();
    expect(screen.getByText("Черновик")).toBeInTheDocument();
    expect(screen.getByText("Готова")).toBeInTheDocument();
  });

  it("показывает заглушку для пустой папки", () => {
    render(wrap(<EstimatesTable data={fixtures} />));
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it('показывает "Смет не найдено" при пустом списке', () => {
    render(wrap(<EstimatesTable data={[]} />));
    expect(screen.getByText("Смет не найдено")).toBeInTheDocument();
  });

  it("показывает скелетоны при загрузке", () => {
    const { container } = render(wrap(<EstimatesTable data={[]} isLoading />));
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
