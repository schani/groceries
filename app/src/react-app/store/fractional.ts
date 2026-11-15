// Fractional indexing over base-62 digit strings compared lexicographically
// (as plain JS / SQLite BINARY strings). Keys never end in "0", so there is
// always room between any two distinct keys.

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ZERO = DIGITS[0];
const LAST = DIGITS[DIGITS.length - 1];

function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const da = a ? DIGITS.indexOf(a[0]) : 0;
  const db = b !== null ? DIGITS.indexOf(b[0]) : DIGITS.length;
  if (db - da > 1) return DIGITS[Math.round((da + db) / 2)];
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[da] + midpoint(a.slice(1), null);
}

/** Smallest-ish key after `a`: bump the first digit that can be bumped. Keeps appends short. */
function after(a: string): string {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== LAST) return a.slice(0, i) + DIGITS[DIGITS.indexOf(a[i]) + 1];
  }
  return a + DIGITS[DIGITS.length >> 1];
}

function check(k: string): void {
  if (!k || k.endsWith(ZERO) || [...k].some((c) => !DIGITS.includes(c))) {
    throw new Error(`invalid fractional key: ${JSON.stringify(k)}`);
  }
}

/** A key strictly between a and b (null = open end). Requires a < b. */
export function between(a: string | null, b: string | null): string {
  if (a !== null) check(a);
  if (b !== null) check(b);
  if (a !== null && b !== null && a >= b) throw new Error(`between: ${a} >= ${b}`);
  if (b === null) return a === null ? DIGITS[DIGITS.length >> 1] : after(a);
  return midpoint(a ?? "", b);
}

/** Like `between`, plus two random digits so clients computing the same slot concurrently don't tie. */
export function jittered(a: string | null, b: string | null, rnd: () => number = Math.random): string {
  const k = between(a, b);
  const cand = k + DIGITS[Math.floor(rnd() * DIGITS.length)] + DIGITS[1 + Math.floor(rnd() * (DIGITS.length - 1))];
  return b === null || cand < b ? cand : k;
}

/** n increasing keys strictly between a and b, spread by bisection so they stay short. */
export function spread(a: string | null, b: string | null, n: number): string[] {
  if (n <= 0) return [];
  const mid = between(a, b);
  const left = spread(a, mid, Math.floor((n - 1) / 2));
  return [...left, mid, ...spread(mid, b, n - 1 - left.length)];
}
