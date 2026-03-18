/**
 * Тесты для formula-engine.ts — зеркало бэкенд-реализации.
 * ~12 тест-кейсов.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateFormula,
  getFormulaDependencies,
  topologicalSort,
  computeAllFormulas,
  validateFormula,
  FormulaError,
  CycleError,
  type ColumnConfig,
} from '../formula-engine';

describe('evaluateFormula', () => {
  it('basic arithmetic', () => {
    expect(evaluateFormula('2 + 3', {})).toBe(5);
    expect(evaluateFormula('10 * 5', {})).toBe(50);
    expect(evaluateFormula('100 / 4', {})).toBe(25);
    expect(evaluateFormula('50 - 20', {})).toBe(30);
  });

  it('operator precedence', () => {
    expect(evaluateFormula('2 + 3 * 4', {})).toBe(14);
  });

  it('parentheses', () => {
    expect(evaluateFormula('(2 + 3) * 4', {})).toBe(20);
  });

  it('nested parentheses', () => {
    expect(evaluateFormula('((2 + 3) * (4 - 1))', {})).toBe(15);
  });

  it('unary minus', () => {
    expect(evaluateFormula('-5 + 3', {})).toBe(-2);
  });

  it('round function', () => {
    expect(evaluateFormula('round(3.7)', {})).toBe(4);
    const result = evaluateFormula('round(3.14159, 2)', {});
    expect(result).toBeCloseTo(3.14, 5);
  });

  it('max, min, abs', () => {
    expect(evaluateFormula('max(1, 5, 3)', {})).toBe(5);
    expect(evaluateFormula('min(10, 3, 7)', {})).toBe(3);
    expect(evaluateFormula('abs(-5)', {})).toBe(5);
  });

  it('variable references', () => {
    const result = evaluateFormula('quantity * price', { quantity: 10, price: 500 });
    expect(result).toBe(5000);
  });

  it('division by zero returns 0', () => {
    expect(evaluateFormula('10 / 0', {})).toBe(0);
  });

  it('unknown variable throws', () => {
    expect(() => evaluateFormula('unknown_var + 1', {})).toThrow(FormulaError);
  });

  it('syntax error throws', () => {
    expect(() => evaluateFormula('(2 + 3', {})).toThrow(FormulaError);
  });

  it('empty formula throws', () => {
    expect(() => evaluateFormula('', {})).toThrow(FormulaError);
  });
});

describe('getFormulaDependencies', () => {
  it('extracts variable names', () => {
    const deps = getFormulaDependencies('quantity * material_unit_price + markup');
    expect(deps).toEqual(new Set(['quantity', 'material_unit_price', 'markup']));
  });

  it('ignores function names', () => {
    const deps = getFormulaDependencies('round(quantity * 1.2, 2)');
    expect(deps).toEqual(new Set(['quantity']));
  });
});

describe('topologicalSort', () => {
  it('sorts dependencies correctly', () => {
    const columns: ColumnConfig[] = [
      { key: 'a', type: 'builtin', label: 'A', width: 80, editable: false, visible: true, aggregatable: false },
      { key: 'c', type: 'formula', formula: 'a + b', label: 'C', width: 80, editable: false, visible: true, aggregatable: false },
      { key: 'b', type: 'formula', formula: 'a * 2', label: 'B', width: 80, editable: false, visible: true, aggregatable: false },
    ];
    const result = topologicalSort(columns);
    const keys = result.map(c => c.key);
    expect(keys.indexOf('b')).toBeLessThan(keys.indexOf('c'));
  });

  it('detects cycles', () => {
    const columns: ColumnConfig[] = [
      { key: 'a', type: 'formula', formula: 'b + 1', label: 'A', width: 80, editable: false, visible: true, aggregatable: false },
      { key: 'b', type: 'formula', formula: 'a + 1', label: 'B', width: 80, editable: false, visible: true, aggregatable: false },
    ];
    expect(() => topologicalSort(columns)).toThrow(CycleError);
  });
});

describe('computeAllFormulas', () => {
  it('computes chain of formulas', () => {
    const columns: ColumnConfig[] = [
      { key: 'quantity', type: 'builtin', label: 'Q', width: 80, editable: false, visible: true, aggregatable: false },
      { key: 'price', type: 'builtin', label: 'P', width: 80, editable: false, visible: true, aggregatable: false },
      { key: 'subtotal', type: 'formula', formula: 'quantity * price', label: 'S', width: 80, editable: false, visible: true, aggregatable: false },
      { key: 'total', type: 'formula', formula: 'subtotal * 1.2', label: 'T', width: 80, editable: false, visible: true, aggregatable: false, decimal_places: 2 },
    ];
    const result = computeAllFormulas(columns, { quantity: 10, price: 500 }, {});
    expect(result.subtotal).toBe(5000);
    expect(result.total).toBe(6000);
  });

  it('uses custom_number data', () => {
    const columns: ColumnConfig[] = [
      { key: 'line_total', type: 'builtin', label: 'LT', width: 80, editable: false, visible: true, aggregatable: false },
      { key: 'markup_pct', type: 'custom_number', label: 'M%', width: 80, editable: true, visible: true, aggregatable: false },
      { key: 'with_markup', type: 'formula', formula: 'line_total * (1 + markup_pct / 100)', label: 'WM', width: 80, editable: false, visible: true, aggregatable: false, decimal_places: 2 },
    ];
    const result = computeAllFormulas(columns, { line_total: 1000 }, { markup_pct: '20' });
    expect(result.with_markup).toBe(1200);
  });

  it('returns null for broken formula', () => {
    const columns: ColumnConfig[] = [
      { key: 'bad', type: 'formula', formula: 'nonexistent * 2', label: 'Bad', width: 80, editable: false, visible: true, aggregatable: false },
    ];
    const result = computeAllFormulas(columns, {}, {});
    expect(result.bad).toBeNull();
  });
});

describe('validateFormula', () => {
  it('valid formula returns empty errors', () => {
    const errors = validateFormula('quantity * 1.2', new Set(['quantity', 'price']));
    expect(errors).toEqual([]);
  });

  it('unknown variable returns error', () => {
    const errors = validateFormula('unknown_var * 2', new Set(['quantity']));
    expect(errors.some(e => e.includes('unknown_var'))).toBe(true);
  });
});

describe('Python/TS parity', () => {
  it('10 / 3 with decimal_places=2 produces consistent result', () => {
    const columns: ColumnConfig[] = [
      { key: 'result', type: 'formula', formula: '10 / 3', label: 'R', width: 80, editable: false, visible: true, aggregatable: false, decimal_places: 2 },
    ];
    const result = computeAllFormulas(columns, {}, {});
    // Python: Decimal('10') / Decimal('3') quantized to 2 places = 3.33
    // JS: 10/3 rounded to 2 places = 3.33
    expect(result.result).toBeCloseTo(3.33, 2);
  });
});
