import { describe, expect, it } from "vitest";
import { pluralize, pluralizeRows, pluralizeSections } from "@/lib/i18n";

describe("pluralizeRows (ru)", () => {
  // Ключевые точки: 0, 1, 2, 5, 11..14, 21, 22, 100, 101, 111
  it.each([
    [0, "строк"],
    [1, "строка"],
    [2, "строки"],
    [3, "строки"],
    [4, "строки"],
    [5, "строк"],
    [10, "строк"],
    [11, "строк"],
    [12, "строк"],
    [14, "строк"],
    [19, "строк"],
    [20, "строк"],
    [21, "строка"],
    [22, "строки"],
    [25, "строк"],
    [100, "строк"],
    [101, "строка"],
    [102, "строки"],
    [111, "строк"],
    [112, "строк"],
    [121, "строка"],
  ])("pluralizeRows(%i) === %s", (n, expected) => {
    expect(pluralizeRows(n)).toBe(expected);
  });
});

describe("pluralizeSections (ru)", () => {
  // «раздел / раздела / разделов» — синхронизировано с UI-09 sections-panel.
  it.each([
    [1, "раздел"],
    [2, "раздела"],
    [5, "разделов"],
    [11, "разделов"],
    [21, "раздел"],
  ])("pluralizeSections(%i) === %s", (n, expected) => {
    expect(pluralizeSections(n)).toBe(expected);
  });
});

describe("pluralize (generic)", () => {
  it("handles negative numbers via abs", () => {
    expect(pluralize(-1, { one: "one", few: "few", many: "many" })).toBe("one");
    expect(pluralize(-11, { one: "one", few: "few", many: "many" })).toBe(
      "many"
    );
  });
});
