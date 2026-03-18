/**
 * Безопасный вычислитель формул для настраиваемых столбцов сметы.
 * Зеркало бэкенд-реализации (Python).
 * Токенизатор + рекурсивный спуск (без eval).
 *
 * Поддерживает: +, -, *, /, (), числовые литералы, ссылки на столбцы,
 * функции round(), max(), min(), abs().
 */

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

export class CycleError extends FormulaError {
  constructor(message: string) {
    super(message);
    this.name = 'CycleError';
  }
}

// --- Tokenizer ---

enum TokenType {
  NUMBER = 'NUMBER',
  IDENT = 'IDENT',
  PLUS = 'PLUS',
  MINUS = 'MINUS',
  MUL = 'MUL',
  DIV = 'DIV',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  COMMA = 'COMMA',
  EOF = 'EOF',
}

interface Token {
  type: TokenType;
  value: string;
}

const MAX_FORMULA_LEN = 500;
const TOKEN_RE = /\s*(?:(\d+(?:\.\d+)?)|([a-z_][a-z0-9_]*)|([-+*/(),]))\s*/g;
const FUNCTIONS = new Set(['round', 'max', 'min', 'abs']);

const CHAR_TOKEN_MAP: Record<string, TokenType> = {
  '+': TokenType.PLUS,
  '-': TokenType.MINUS,
  '*': TokenType.MUL,
  '/': TokenType.DIV,
  '(': TokenType.LPAREN,
  ')': TokenType.RPAREN,
  ',': TokenType.COMMA,
};

function tokenize(formula: string): Token[] {
  if (!formula || !formula.trim()) {
    throw new FormulaError('Пустая формула');
  }
  if (formula.length > MAX_FORMULA_LEN) {
    throw new FormulaError(`Формула слишком длинная (>${MAX_FORMULA_LEN} символов)`);
  }

  const tokens: Token[] = [];
  const re = new RegExp(TOKEN_RE.source, 'g');
  let lastIndex = 0;

  while (lastIndex < formula.length) {
    // Skip whitespace
    while (lastIndex < formula.length && /\s/.test(formula[lastIndex])) {
      lastIndex++;
    }
    if (lastIndex >= formula.length) break;

    re.lastIndex = lastIndex;
    const m = re.exec(formula);

    if (!m || m.index !== lastIndex) {
      throw new FormulaError(`Неожиданный символ на позиции ${lastIndex}: '${formula[lastIndex]}'`);
    }

    if (m[1] !== undefined) {
      tokens.push({ type: TokenType.NUMBER, value: m[1] });
    } else if (m[2] !== undefined) {
      tokens.push({ type: TokenType.IDENT, value: m[2] });
    } else if (m[3] !== undefined) {
      const tt = CHAR_TOKEN_MAP[m[3]];
      if (!tt) {
        throw new FormulaError(`Неожиданный символ: '${m[3]}'`);
      }
      tokens.push({ type: tt, value: m[3] });
    }

    lastIndex = re.lastIndex || m.index + m[0].length;
  }

  tokens.push({ type: TokenType.EOF, value: '' });
  return tokens;
}

// --- Parser (recursive descent) ---

class Parser {
  private tokens: Token[];
  private variables: Record<string, number>;
  private pos = 0;

  constructor(tokens: Token[], variables: Record<string, number>) {
    this.tokens = tokens;
    this.variables = variables;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(tt: TokenType): Token {
    const t = this.advance();
    if (t.type !== tt) {
      throw new FormulaError(`Ожидался ${tt}, получен ${t.type} ('${t.value}')`);
    }
    return t;
  }

  parse(): number {
    const result = this.expr();
    if (this.peek().type !== TokenType.EOF) {
      throw new FormulaError(`Неожиданный токен: '${this.peek().value}'`);
    }
    return result;
  }

  private expr(): number {
    let left = this.term();
    while (this.peek().type === TokenType.PLUS || this.peek().type === TokenType.MINUS) {
      const op = this.advance();
      const right = this.term();
      left = op.type === TokenType.PLUS ? left + right : left - right;
    }
    return left;
  }

  private term(): number {
    let left = this.unary();
    while (this.peek().type === TokenType.MUL || this.peek().type === TokenType.DIV) {
      const op = this.advance();
      const right = this.unary();
      if (op.type === TokenType.MUL) {
        left = left * right;
      } else {
        if (right === 0) {
          left = 0; // Graceful: деление на 0 → 0
        } else {
          left = left / right;
        }
      }
    }
    return left;
  }

  private unary(): number {
    if (this.peek().type === TokenType.MINUS) {
      this.advance();
      return -this.unary();
    }
    return this.atom();
  }

  private atom(): number {
    const t = this.peek();

    if (t.type === TokenType.NUMBER) {
      this.advance();
      return parseFloat(t.value);
    }

    if (t.type === TokenType.IDENT) {
      this.advance();
      const name = t.value;

      // Function call
      if (this.peek().type === TokenType.LPAREN && FUNCTIONS.has(name)) {
        return this.callFunction(name);
      }

      // Variable reference
      if (!(name in this.variables)) {
        throw new FormulaError(`Неизвестная переменная: ${name}`);
      }
      return this.variables[name];
    }

    if (t.type === TokenType.LPAREN) {
      this.advance();
      const result = this.expr();
      this.expect(TokenType.RPAREN);
      return result;
    }

    throw new FormulaError(`Неожиданный токен: '${t.value}' (${t.type})`);
  }

  private callFunction(name: string): number {
    this.expect(TokenType.LPAREN);
    const args: number[] = [this.expr()];
    while (this.peek().type === TokenType.COMMA) {
      this.advance();
      args.push(this.expr());
    }
    this.expect(TokenType.RPAREN);

    switch (name) {
      case 'round': {
        if (args.length === 1) {
          return Math.round(args[0]);
        } else if (args.length === 2) {
          const factor = Math.pow(10, args[1]);
          return Math.round(args[0] * factor) / factor;
        }
        throw new FormulaError('round() принимает 1 или 2 аргумента');
      }
      case 'max':
        if (args.length === 0) throw new FormulaError('max() требует хотя бы 1 аргумент');
        return Math.max(...args);
      case 'min':
        if (args.length === 0) throw new FormulaError('min() требует хотя бы 1 аргумент');
        return Math.min(...args);
      case 'abs':
        if (args.length !== 1) throw new FormulaError('abs() принимает ровно 1 аргумент');
        return Math.abs(args[0]);
      default:
        throw new FormulaError(`Неизвестная функция: ${name}`);
    }
  }
}

// --- Public API ---

/**
 * Вычислить формулу с заданными переменными.
 */
export function evaluateFormula(formula: string, variables: Record<string, number>): number {
  const tokens = tokenize(formula);
  return new Parser(tokens, variables).parse();
}

/**
 * Извлечь имена переменных, используемых в формуле.
 */
export function getFormulaDependencies(formula: string): Set<string> {
  const tokens = tokenize(formula);
  const deps = new Set<string>();
  for (const token of tokens) {
    if (token.type === TokenType.IDENT && !FUNCTIONS.has(token.value)) {
      deps.add(token.value);
    }
  }
  return deps;
}

export interface ColumnConfig {
  key: string;
  label: string;
  type: 'builtin' | 'custom_number' | 'custom_text' | 'custom_date' | 'custom_select' | 'custom_checkbox' | 'formula';
  builtin_field?: string | null;
  width: number;
  editable: boolean;
  visible: boolean;
  formula?: string | null;
  decimal_places?: number | null;
  aggregatable: boolean;
  options?: string[] | null;
}

/**
 * Топологическая сортировка формульных столбцов.
 * Бросает CycleError при циклических зависимостях.
 */
export function topologicalSort(columns: ColumnConfig[]): ColumnConfig[] {
  const formulaCols = new Map<string, ColumnConfig>();
  for (const c of columns) {
    if (c.type === 'formula' && c.formula) {
      formulaCols.set(c.key, c);
    }
  }
  if (formulaCols.size === 0) return columns;

  const deps = new Map<string, Set<string>>();
  for (const [key, col] of formulaCols) {
    try {
      const allDeps = getFormulaDependencies(col.formula!);
      const formulaKeys = new Set(formulaCols.keys());
      const filtered = new Set<string>();
      for (const d of allDeps) {
        if (formulaKeys.has(d)) filtered.add(d);
      }
      deps.set(key, filtered);
    } catch {
      deps.set(key, new Set());
    }
  }

  // Kahn's algorithm
  const inDegree = new Map<string, number>();
  for (const key of formulaCols.keys()) inDegree.set(key, 0);

  for (const [key, depSet] of deps) {
    for (const dep of depSet) {
      if (inDegree.has(dep)) {
        inDegree.set(key, (inDegree.get(key) || 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [k, d] of inDegree) {
    if (d === 0) queue.push(k);
  }

  const sortedKeys: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sortedKeys.push(node);
    for (const [key, depSet] of deps) {
      if (depSet.has(node)) {
        const newDeg = (inDegree.get(key) || 0) - 1;
        inDegree.set(key, newDeg);
        if (newDeg === 0) queue.push(key);
      }
    }
  }

  if (sortedKeys.length !== formulaCols.size) {
    const remaining = new Set(formulaCols.keys());
    for (const k of sortedKeys) remaining.delete(k);
    throw new CycleError(`Циклическая зависимость в формулах: ${[...remaining].join(', ')}`);
  }

  const nonFormula = columns.filter(c => !formulaCols.has(c.key));
  return [...nonFormula, ...sortedKeys.map(k => formulaCols.get(k)!)];
}

/**
 * Вычислить все formula-столбцы для одной строки.
 * Возвращает { key: number | null }.
 */
export function computeAllFormulas(
  columns: ColumnConfig[],
  builtinValues: Record<string, number>,
  customData: Record<string, string>,
): Record<string, number | null> {
  const sortedCols = topologicalSort(columns);
  const variables: Record<string, number> = { ...builtinValues };

  // Add custom_number values
  for (const col of columns) {
    if (col.type === 'custom_number' && col.key in customData) {
      const parsed = parseFloat(customData[col.key]);
      variables[col.key] = isNaN(parsed) ? 0 : parsed;
    }
  }

  const results: Record<string, number | null> = {};
  for (const col of sortedCols) {
    if (col.type !== 'formula' || !col.formula) continue;
    try {
      let value = evaluateFormula(col.formula, variables);
      if (col.decimal_places != null) {
        const factor = Math.pow(10, col.decimal_places);
        value = Math.round(value * factor) / factor;
      }
      results[col.key] = value;
      variables[col.key] = value;
    } catch {
      results[col.key] = null;
    }
  }

  return results;
}

/**
 * Валидировать формулу. Возвращает список ошибок (пустой = OK).
 */
export function validateFormula(formula: string, availableKeys: Set<string>): string[] {
  const errors: string[] = [];
  let tokens: Token[];
  try {
    tokens = tokenize(formula);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return errors;
  }

  for (const token of tokens) {
    if (token.type === TokenType.IDENT && !FUNCTIONS.has(token.value)) {
      if (!availableKeys.has(token.value)) {
        errors.push(`Неизвестная переменная: ${token.value}`);
      }
    }
  }

  try {
    const dummyVars: Record<string, number> = {};
    for (const k of availableKeys) dummyVars[k] = 1;
    new Parser(tokens, dummyVars).parse();
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  return errors;
}
