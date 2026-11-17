/**
 * Shared plumbing for MCP tools: the Tool shape, JSON-schema helpers, and a
 * small argument reader that validates untrusted tool input with readable
 * error messages (returned to the model as tool errors).
 */
import type { McpAuth, Scope } from '$lib/server/auth/oauth';

export type Args = Record<string, unknown>;

export class ToolError extends Error {}

export type Tool = {
  name: string;
  title: string;
  description: string;
  scope: Scope;
  readOnly: boolean;
  /** Removes or overwrites data that can't be recovered from the app. */
  destructive?: boolean;
  /** Repeating the same call leaves the same end state. */
  idempotent?: boolean;
  inputSchema: Record<string, unknown>;
  run: (auth: McpAuth, args: Args) => Promise<unknown>;
};

// --- JSON schema helpers ----------------------------------------------------

export const uuidProp = (description: string) => ({ type: 'string', format: 'uuid', description });

export const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false
});

/** A property that also accepts null (used by update tools to clear a field). */
export const nullable = (schema: Record<string, unknown>) => ({
  ...schema,
  type: [schema.type as string, 'null']
});

// --- Argument reader --------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

type Opts = { required?: boolean; nullable?: boolean };
type NumOpts = Opts & { min?: number; max?: number; int?: boolean };

/**
 * Reads typed fields from an untrusted object. Each getter returns `undefined`
 * when the key is absent, `null` when it is null and `nullable` is set, and
 * throws a ToolError naming the field (with its path) otherwise.
 */
export class ArgReader {
  constructor(
    readonly raw: Args,
    private readonly path = ''
  ) {}

  static of(value: unknown, path: string): ArgReader {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ToolError(`"${path}" must be an object.`);
    }
    return new ArgReader(value as Args, path);
  }

  name(key: string) {
    return this.path ? `${this.path}.${key}` : key;
  }

  has(key: string) {
    return this.raw[key] !== undefined;
  }

  /** Reject keys outside `keys`, so a misspelt field fails loudly instead of being ignored. */
  only(...keys: string[]): this {
    const extra = Object.keys(this.raw).filter((k) => !keys.includes(k));
    if (extra.length) {
      throw new ToolError(
        `Unknown field${extra.length > 1 ? 's' : ''} ${extra.map((k) => `"${this.name(k)}"`).join(', ')}. ` +
          `Allowed: ${keys.join(', ')}.`
      );
    }
    return this;
  }

  private pre(key: string, o: Opts): { v: unknown; done: boolean; out?: null | undefined } {
    const v = this.raw[key];
    if (v === undefined) {
      if (o.required) throw new ToolError(`"${this.name(key)}" is required.`);
      return { v, done: true, out: undefined };
    }
    if (v === null) {
      if (o.nullable) return { v, done: true, out: null };
      throw new ToolError(`"${this.name(key)}" can't be null.`);
    }
    return { v, done: false };
  }

  str(key: string, o: Opts & { max?: number; trim?: boolean } = {}): string | null | undefined {
    const p = this.pre(key, o);
    if (p.done) return p.out;
    if (typeof p.v !== 'string') throw new ToolError(`"${this.name(key)}" must be a string.`);
    const s = o.trim === false ? p.v : p.v.trim();
    if (o.required && !s) throw new ToolError(`"${this.name(key)}" must not be empty.`);
    if (o.max && s.length > o.max) throw new ToolError(`"${this.name(key)}" is limited to ${o.max} characters.`);
    return s;
  }

  num(key: string, o: NumOpts = {}): number | null | undefined {
    const p = this.pre(key, o);
    if (p.done) return p.out;
    const n = typeof p.v === 'number' ? p.v : typeof p.v === 'string' && p.v.trim() ? Number(p.v) : NaN;
    if (!Number.isFinite(n)) throw new ToolError(`"${this.name(key)}" must be a number.`);
    if (o.int && !Number.isInteger(n)) throw new ToolError(`"${this.name(key)}" must be a whole number.`);
    if (o.min != null && n < o.min) throw new ToolError(`"${this.name(key)}" must be at least ${o.min}.`);
    if (o.max != null && n > o.max) throw new ToolError(`"${this.name(key)}" must be at most ${o.max}.`);
    return n;
  }

  int(key: string, o: NumOpts = {}) {
    return this.num(key, { ...o, int: true });
  }

  bool(key: string, o: Opts = {}): boolean | null | undefined {
    const p = this.pre(key, o);
    if (p.done) return p.out;
    if (typeof p.v !== 'boolean') throw new ToolError(`"${this.name(key)}" must be true or false.`);
    return p.v;
  }

  oneOf<T extends string>(key: string, values: readonly T[], o: Opts = {}): T | null | undefined {
    const p = this.pre(key, o);
    if (p.done) return p.out;
    if (typeof p.v !== 'string' || !values.includes(p.v as T)) {
      throw new ToolError(`"${this.name(key)}" must be one of: ${values.join(', ')}.`);
    }
    return p.v as T;
  }

  uuid(key: string, o: Opts = {}): string | null | undefined {
    const s = this.str(key, o);
    if (s && !UUID.test(s)) throw new ToolError(`"${this.name(key)}" must be a UUID.`);
    return s;
  }

  /** A timestamp; accepts a full ISO datetime or a bare YYYY-MM-DD. */
  date(key: string, o: Opts = {}): Date | null | undefined {
    const s = this.str(key, o);
    if (s == null) return s;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
      throw new ToolError(`"${this.name(key)}" must be an ISO date/time (e.g. 2026-01-31T18:30:00Z).`);
    }
    return d;
  }

  /** A calendar date, YYYY-MM-DD. */
  day(key: string, o: Opts = {}): string | null | undefined {
    const s = this.str(key, o);
    if (s && (!DATE_ONLY.test(s) || Number.isNaN(new Date(s).getTime()))) {
      throw new ToolError(`"${this.name(key)}" must be a date in YYYY-MM-DD form.`);
    }
    return s;
  }

  arr(key: string, o: Opts & { max?: number } = {}): unknown[] | null | undefined {
    const p = this.pre(key, o);
    if (p.done) return p.out;
    if (!Array.isArray(p.v)) throw new ToolError(`"${this.name(key)}" must be an array.`);
    if (o.max && p.v.length > o.max) throw new ToolError(`"${this.name(key)}" has more than ${o.max} items.`);
    return p.v;
  }

  uuids(key: string, o: Opts & { max?: number } = {}): string[] | null | undefined {
    const a = this.arr(key, o);
    if (a == null) return a;
    for (const [i, v] of a.entries()) {
      if (typeof v !== 'string' || !UUID.test(v)) throw new ToolError(`"${this.name(key)}[${i}]" must be a UUID.`);
    }
    return [...new Set(a as string[])];
  }

  /** Each element of an array as its own reader. */
  objs(key: string, o: Opts & { max?: number } = {}): ArgReader[] | null | undefined {
    const a = this.arr(key, o);
    if (a == null) return a;
    return a.map((v, i) => ArgReader.of(v, `${this.name(key)}[${i}]`));
  }

  sub(key: string, o: Opts = {}): ArgReader | null | undefined {
    const p = this.pre(key, o);
    if (p.done) return p.out;
    return ArgReader.of(p.v, this.name(key));
  }
}

/** Drop undefined keys so a patch only touches the fields that were given. */
export function defined<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
