// ── What survives the on-device cache ───────────────────────────────────────
//
// React Query's persister writes the cache with JSON.stringify and reads it
// back with JSON.parse. Anything that does not survive that round trip is a
// time bomb: it works on the launch that fetched it and breaks on every
// launch after, when the rehydrated value has the right name and the wrong
// shape. A Map became `{}` with no `.get` and took the Logbook tab down in
// two builds before anyone could see why.
//
// The rule is the same for every one of them: keep plain JSON in the cache
// and build the rich value in `select`, which runs after rehydration and is
// never persisted.

export type JsonProblem = { path: string; found: string; why: string };

const MAX_NODES = 20000;   // a guard, not a budget: payloads are a few hundred

/**
 * The first value in `root` that JSON cannot round-trip, or null.
 *
 * Reports a path a human can act on ("airports[3].firstDate") rather than
 * just a boolean, because the whole point is to name the offender.
 */
export function findUnJsonSafe(root: unknown): JsonProblem | null {
  let nodes = 0;
  const seen = new Set<object>();

  const walk = (v: unknown, path: string): JsonProblem | null => {
    if (nodes++ > MAX_NODES) return null;
    if (v === null) return null;

    const t = typeof v;
    if (t === 'string' || t === 'boolean') return null;
    if (t === 'number') {
      // NaN and ±Infinity both come back as null.
      return Number.isFinite(v as number) ? null
        : { path, found: String(v), why: 'JSON turns it into null' };
    }
    if (t === 'undefined') {
      return { path, found: 'undefined', why: 'JSON drops it in an object and turns it into null in an array' };
    }
    if (t === 'function') return { path, found: 'function', why: 'JSON drops it' };
    if (t === 'bigint') return { path, found: 'bigint', why: 'JSON.stringify throws on it' };
    if (t === 'symbol') return { path, found: 'symbol', why: 'JSON drops it' };

    const o = v as object;
    if (seen.has(o)) return { path, found: 'circular reference', why: 'JSON.stringify throws on it' };
    seen.add(o);

    if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i += 1) {
        const p = walk(o[i], `${path}[${i}]`);
        if (p) return p;
      }
      return null;
    }

    if (o instanceof Date) {
      return { path, found: 'Date', why: 'it comes back as a string, so .getTime() is gone' };
    }
    if (o instanceof Map || o instanceof Set || o instanceof WeakMap || o instanceof WeakSet) {
      const name = o.constructor.name;
      return { path, found: name, why: `it comes back as {}, so .get/.has/.size are gone — build the ${name} in select` };
    }
    if (o instanceof RegExp) return { path, found: 'RegExp', why: 'it comes back as {}' };
    if (o instanceof Error) return { path, found: 'Error', why: 'message and stack are both lost' };
    if (ArrayBuffer.isView(o) || o instanceof ArrayBuffer) {
      return { path, found: o.constructor.name, why: 'it comes back as a plain object of indices' };
    }

    // A class instance keeps its fields but loses its prototype, so every
    // method on it is gone after a restart.
    const proto = Object.getPrototypeOf(o);
    if (proto !== null && proto !== Object.prototype) {
      const name = o.constructor?.name || 'class instance';
      return { path, found: name, why: 'a class instance loses its prototype, so its methods are gone' };
    }

    for (const [k, val] of Object.entries(o as Record<string, unknown>)) {
      const p = walk(val, path ? `${path}.${k}` : k);
      if (p) return p;
    }
    return null;
  };

  return walk(root, '');
}

/** "data.airports[2] is a Date — it comes back as a string…" */
export function describeJsonProblem(queryHash: string, p: JsonProblem): string {
  const where = p.path ? `data.${p.path}` : 'data';
  return `${queryHash}: ${where} is a ${p.found} — ${p.why}.`;
}
