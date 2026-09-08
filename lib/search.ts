/**
 * The two rules that decide whether and when a destination search happens.
 *
 * They live here rather than inside the component because this repo's vitest
 * runs in `node` with no DOM and silently does not collect `.test.tsx`, so
 * logic inside a component is logic with no test. Extracting it is the house
 * rule, and these two rules are worth the file: one of them is the difference
 * between five requests per word and one.
 */

/** Below three characters there is nothing to rank. The server agrees. */
export const MIN_QUERY = 3;

/** About a keystroke apart. Long enough to coalesce a word, short enough to feel live. */
export const DEBOUNCE_MS = 250;

export function shouldSearch(raw: string): boolean {
  return raw.trim().length >= MIN_QUERY;
}

export interface Timers {
  set: (fn: () => void, ms: number) => number;
  clear: (id: number) => void;
}

/**
 * Runs the most recent call and drops the ones it superseded.
 *
 * Timers are injectable because the alternative is faking them globally, and
 * this repo prefers a seam to a mocked clock.
 */
export function createDebouncer(
  delayMs: number,
  timers?: Timers
): { run(fn: () => void): void; cancel(): void } {
  const t: Timers =
    timers ?? {
      set: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clear: (id) => clearTimeout(id),
    };
  let pending: number | null = null;

  return {
    run(fn) {
      if (pending !== null) t.clear(pending);
      pending = t.set(() => {
        pending = null;
        fn();
      }, delayMs);
    },
    cancel() {
      if (pending !== null) t.clear(pending);
      pending = null;
    },
  };
}
