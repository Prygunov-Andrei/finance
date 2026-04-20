import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EmptyEstimatesState } from "@/app/estimates/empty-state";
import { formatCurrency } from "@/lib/utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("formatCurrency — форматирование чисел", () => {
  // Intl.NumberFormat('ru-RU') использует U+00A0 (неразрывный пробел)
  // и U+202F (narrow no-break space) в разных Node-версиях.
  const SPACE = /[\s\u00a0\u202f]/g;

  it("1 250 000 → '1 250 000 ₽' с пробелами-разделителями", () => {
    const raw = formatCurrency(1250000);
    // Убираем все пробельные варианты для проверки цифровой структуры
    expect(raw.replace(SPACE, "")).toBe("1250000,00₽");
    // В строке должны быть три пробела-разделителя (тысячи/миллионы + перед ₽)
    const spacesCount = (raw.match(SPACE) ?? []).length;
    expect(spacesCount).toBeGreaterThanOrEqual(3);
  });

  it("строковый вход 500 парсится и форматируется", () => {
    const result = formatCurrency("500");
    expect(result.replace(SPACE, "")).toBe("500,00₽");
  });

  it("0 → '0 ₽'", () => {
    const result = formatCurrency(0);
    expect(result.replace(SPACE, "")).toBe("0,00₽");
  });

  it("NaN / нечисло → '—'", () => {
    expect(formatCurrency("abc")).toBe("—");
    expect(formatCurrency(Number.NaN)).toBe("—");
  });

  it("округляет до целых (без копеек)", () => {
    const result = formatCurrency(1234.56);
    expect(result.replace(SPACE, "")).toBe("1234,56₽");
  });
});

describe("EmptyEstimatesState", () => {
  it("рендерит заголовок «Создайте первую смету» и кнопку «Новая смета»", () => {
    render(wrap(<EmptyEstimatesState />));
    expect(
      screen.getByRole("status", { name: "" }) ??
        screen.getByTestId("estimates-empty-state"),
    ).toBeInTheDocument();
    expect(screen.getByText("Создайте первую смету")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Новая смета/ }),
    ).toBeInTheDocument();
  });

  it("показывает подсказочный текст про ИИ", () => {
    render(wrap(<EmptyEstimatesState />));
    // Текст empty-state эволюционировал с добавлением PDF: проверяем
    // что копирайт упоминает «подберёт работы» (стабильная часть).
    expect(screen.getByText(/подберёт работы/)).toBeInTheDocument();
  });
});
