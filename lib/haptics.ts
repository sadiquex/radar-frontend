import type { VerdictTone } from "./verdict";

// You cannot read a toast mid-stride, so meaningful status changes also buzz.
// Patterns are deliberately short: this fires while someone is moving.
const PATTERN: Partial<Record<VerdictTone, number[]>> = {
  alarm: [60, 40, 60],
  attention: [40],
};

export function patternFor(tone: VerdictTone): number[] | null {
  return PATTERN[tone] ?? null;
}

// iOS Safari does not implement navigator.vibrate at all, so this is
// effectively Android-only. The UI says so rather than quietly doing nothing.
export function hapticsSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function buzz(tone: VerdictTone): boolean {
  const pattern = patternFor(tone);
  if (!pattern || !hapticsSupported()) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
