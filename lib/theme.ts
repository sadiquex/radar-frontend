export type ThemeChoice = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export const THEME_KEY = "gt:theme";

// Anything unrecognised (missing key, old value, corrupted storage) is "system".
export function normalizeChoice(raw: string | null | undefined): ThemeChoice {
  return raw === "light" || raw === "dark" ? raw : "system";
}

// The single source of truth for "which theme is showing right now".
export function resolveTheme(stored: string | null | undefined, prefersDark: boolean): Theme {
  const choice = normalizeChoice(stored);
  if (choice === "system") return prefersDark ? "dark" : "light";
  return choice;
}

// Inlined into <head> and run before first paint, so the correct theme is on
// <html> by the time anything renders. Keep it tiny and total: a throw here
// would block the page, and localStorage access itself throws in some browsers.
export const THEME_BOOTSTRAP = `(function(){try{var s=localStorage.getItem("${THEME_KEY}");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;var t=(s==="light"||s==="dark")?s:(d?"dark":"light");document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
