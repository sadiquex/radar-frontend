import { normalizeChoice, resolveTheme, THEME_KEY, type ThemeChoice } from "./theme";
import type { AccountPreferences } from "./data/account";

/**
 * Settings, and which side of the wire wins.
 *
 * The rule, in order:
 *
 *  1. **localStorage is the pre-paint source of truth.** `THEME_BOOTSTRAP` runs
 *     inlined in `<head>` before first paint and cannot wait on a network call.
 *     Making the server authoritative would reintroduce the white flash that
 *     bootstrap exists to prevent.
 *  2. **On sign-in the account's settings are adopted** and written locally.
 *     That is the entire point of storing them: a new phone should arrive set
 *     up the way the last one was.
 *  3. **After that, local changes push up.** A failed push is not surfaced —
 *     the setting has already applied and is already visible, and a toast about
 *     a sync failure is noise about something nobody can act on.
 *
 * Consequence worth knowing: a change on one device does not reach another
 * until that one reloads. Live-syncing settings would mean a second realtime
 * channel for something nobody is watching.
 */

/** Alerts are opt-in per browser, because the permission prompt is per browser. */
export const NOTIFS_KEY = "gt:notifs";

export interface LocalPreferences {
  theme: ThemeChoice;
  notifications: boolean;
}

const read = (key: string): string | null => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    // Private mode, or a browser with storage blocked. Defaults apply.
    return null;
  }
};

const write = (key: string, value: string | null): void => {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    // The choice still applies for this session.
  }
};

export function readLocalPreferences(): LocalPreferences {
  return {
    theme: normalizeChoice(read(THEME_KEY)),
    notifications: read(NOTIFS_KEY) === "1",
  };
}

/** Writes one or both settings and returns the merged result. */
export function writeLocalPreference(patch: Partial<LocalPreferences>): LocalPreferences {
  if (patch.theme !== undefined) {
    write(THEME_KEY, patch.theme === "system" ? null : patch.theme);
  }
  if (patch.notifications !== undefined) {
    write(NOTIFS_KEY, patch.notifications ? "1" : null);
  }
  return readLocalPreferences();
}

/**
 * Puts the theme on `<html>`.
 *
 * Applies every choice, not just "system". An earlier version of this logic
 * returned early for explicit choices and left the bootstrap's value wherever
 * it happened to be, which made the toggle look broken in one direction.
 */
export function applyPreferences(prefs: LocalPreferences): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute(
    "data-theme",
    resolveTheme(prefs.theme === "system" ? null : prefs.theme, prefersDark)
  );
}

/**
 * Takes on an account's settings at sign-in.
 *
 * Only fields the account actually carries: a `{}` from a server that has
 * never been told anything must not reset a browser that has.
 */
export function adoptAccountPreferences(remote: AccountPreferences): LocalPreferences {
  const patch: Partial<LocalPreferences> = {};
  if (remote.theme !== undefined) patch.theme = remote.theme;
  if (remote.notifications !== undefined) patch.notifications = remote.notifications;

  const merged = writeLocalPreference(patch);
  applyPreferences(merged);
  return merged;
}
