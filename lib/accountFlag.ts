/**
 * A cached "this browser was signed in last time" bit.
 *
 * `useAccount` cannot answer that question until `/v1/auth/me` returns, so a
 * tab bar gated on the real answer appears a round trip late and shoves the
 * page up under whoever is reading it. This is read synchronously on first
 * render so the shell is the right shape immediately, exactly as
 * `THEME_BOOTSTRAP` does for the theme.
 *
 * It is a cache and never a source of truth. A stale `true` shows a tab bar
 * for the half-second before `/auth/me` disagrees, which is the failure this
 * is willing to have; a stale `false` costs one layout shift, which is the
 * failure it exists to avoid in the common case.
 *
 * The key is `gt:`-prefixed like the others but is not one of the load-bearing
 * ones: `subscribe` in `lib/data/index.ts` matches the literal `gt:trip:`,
 * `gt:code:` and `gt:participants:` prefixes, so this fans nothing out —
 * exactly as `gt:theme` does not.
 */
export const SIGNED_IN_KEY = "gt:signedIn";

/** Total and never throws: localStorage access itself throws in some browsers. */
export function wasSignedIn(): boolean {
  try {
    return globalThis.localStorage?.getItem(SIGNED_IN_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberSignedIn(signedIn: boolean): void {
  try {
    if (signedIn) globalThis.localStorage?.setItem(SIGNED_IN_KEY, "1");
    else globalThis.localStorage?.removeItem(SIGNED_IN_KEY);
  } catch {
    // A browser with storage blocked simply pays the layout shift.
  }
  stampSignedIn(signedIn);
}

/** The attribute the CSS in globals.css keys the tab bar's visibility off. */
export const SIGNED_IN_ATTR = "data-signed-in";

export function stampSignedIn(signedIn: boolean): void {
  if (typeof document === "undefined") return;
  if (signedIn) document.documentElement.setAttribute(SIGNED_IN_ATTR, "1");
  else document.documentElement.removeAttribute(SIGNED_IN_ATTR);
}

/**
 * Stamps the cached flag on `<html>` before first paint.
 *
 * This exists because the obvious approach does not work. Rendering the tab
 * bar only when a localStorage-derived boolean is true means the server
 * renders no `<nav>` and the client renders one on its very first pass — a
 * hydration mismatch on every single load. React does not patch that up: it
 * discards the entire server document and re-renders on the client, which
 * throws away whatever `THEME_BOOTSTRAP` had just set and makes the theme
 * toggle look broken.
 *
 * So the markup is identical on both sides — the bar is always in the tree —
 * and only its visibility is decided here, pre-paint, in CSS. Same mechanism
 * as the theme, and for the same reason.
 */
export const SIGNED_IN_BOOTSTRAP = `(function(){try{if(localStorage.getItem("${SIGNED_IN_KEY}")==="1"){document.documentElement.setAttribute("${SIGNED_IN_ATTR}","1")}}catch(e){}})()`;
