import { describe, it, expect, beforeEach, vi } from "vitest";
import { GIS_SCRIPT_URL, loadGoogleIdentityServices, resetGisLoader } from "../googleSignIn";

describe("loadGoogleIdentityServices", () => {
  let appended: Array<{ src: string; async: boolean; defer: boolean }>;
  let scripts: Map<string, { onload?: () => void; onerror?: () => void }>;

  beforeEach(() => {
    resetGisLoader();
    appended = [];
    scripts = new Map();

    const fakeDocument = {
      querySelector: (selector: string) => {
        const match = /\[src="(.+)"\]/.exec(selector);
        const src = match?.[1] ?? "";
        return appended.some((s) => s.src === src) ? {} : null;
      },
      createElement: () => {
        const el: Record<string, unknown> = { async: false, defer: false, src: "" };
        return el;
      },
      head: {
        appendChild: (el: Record<string, unknown>) => {
          const src = String(el.src);
          appended.push({ src, async: Boolean(el.async), defer: Boolean(el.defer) });
          scripts.set(src, el as { onload?: () => void; onerror?: () => void });
        },
      },
    };
    vi.stubGlobal("document", fakeDocument);
  });

  const settle = async (how: "load" | "error") => {
    // Let the loader append the tag before firing its handler.
    await Promise.resolve();
    const el = scripts.get(GIS_SCRIPT_URL);
    if (how === "load") el?.onload?.();
    else el?.onerror?.();
  };

  it("loads Google's script from Google's own origin", async () => {
    // Never self-hosted: Google rotates this and signs in against it.
    const pending = loadGoogleIdentityServices();
    await settle("load");
    await pending;
    expect(appended).toHaveLength(1);
    expect(appended[0].src).toBe("https://accounts.google.com/gsi/client");
    expect(appended[0].async).toBe(true);
  });

  it("loads it once no matter how many callers ask", async () => {
    // Two screens can offer sign-in; appending the script twice would
    // re-initialise Google's client underneath the first one.
    const a = loadGoogleIdentityServices();
    const b = loadGoogleIdentityServices();
    await settle("load");
    await Promise.all([a, b]);
    expect(appended).toHaveLength(1);
  });

  it("resolves immediately once it has already loaded", async () => {
    const first = loadGoogleIdentityServices();
    await settle("load");
    await first;
    await expect(loadGoogleIdentityServices()).resolves.toBeUndefined();
    expect(appended).toHaveLength(1);
  });

  it("rejects when the script cannot be fetched", async () => {
    // Blocked by an extension or a captive portal — the caller falls back to
    // typing a name rather than showing a dead button.
    const pending = loadGoogleIdentityServices();
    await settle("error");
    await expect(pending).rejects.toThrow(/google/i);
  });

  it("lets a later attempt retry after a failure", async () => {
    const failed = loadGoogleIdentityServices();
    await settle("error");
    await expect(failed).rejects.toThrow();

    // A cached rejection would strand the button for the rest of the session.
    appended = [];
    scripts.clear();
    const retry = loadGoogleIdentityServices();
    await settle("load");
    await expect(retry).resolves.toBeUndefined();
  });
});
