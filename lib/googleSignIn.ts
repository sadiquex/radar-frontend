/**
 * Google Identity Services, loaded on demand.
 *
 * The official button rather than One Tap: One Tap can be suppressed by the
 * browser, by a previous dismissal, or by third-party cookie policy, and a
 * sign-in affordance that silently does nothing is worse than none. The
 * rendered button is the supported path and also satisfies Google's branding
 * requirements.
 *
 * The script comes from Google's origin and is never self-hosted — they rotate
 * it, and sign-in is verified against it.
 */

export const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";

/** Shared so two screens offering sign-in don't append the tag twice. */
let loading: Promise<void> | null = null;

export function resetGisLoader(): void {
  loading = null;
}

export function loadGoogleIdentityServices(): Promise<void> {
  if (loading !== null) return loading;

  loading = new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${GIS_SCRIPT_URL}"]`) !== null) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      // Blocked by an extension, a captive portal, or an offline device.
      reject(new Error("Could not load Google sign-in"));
    document.head.appendChild(script);
  });

  // A cached rejection would strand the button for the rest of the session, so
  // a failure clears the slot and the next attempt retries.
  loading.catch(() => {
    loading = null;
  });

  return loading;
}

// ── The subset of Google's client this app uses ────────────────────────────

export interface GisButtonOptions {
  theme?: "outline" | "filled_black" | "filled_blue";
  size?: "small" | "medium" | "large";
  text?: "signin_with" | "signup_with" | "continue_with";
  shape?: "rectangular" | "pill";
  width?: number;
}

interface GisClient {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
        use_fedcm_for_prompt?: boolean;
      }): void;
      renderButton(parent: HTMLElement, options: GisButtonOptions): void;
      disableAutoSelect(): void;
    };
  };
}

function gis(): GisClient {
  const client = (globalThis as { google?: GisClient }).google;
  if (client === undefined) throw new Error("Google sign-in is not loaded");
  return client;
}

/**
 * Renders Google's button into `parent` and calls `onCredential` with the ID
 * token when someone signs in. The token goes straight to our server, which is
 * the only place it can be verified.
 */
export async function renderGoogleButton(opts: {
  parent: HTMLElement;
  clientId: string;
  onCredential: (idToken: string) => void;
  onError: (message: string) => void;
  options?: GisButtonOptions;
}): Promise<void> {
  await loadGoogleIdentityServices();

  gis().accounts.id.initialize({
    client_id: opts.clientId,
    callback: (response) => {
      const credential = response.credential;
      if (typeof credential !== "string" || credential.length === 0) {
        opts.onError("Google returned no credential");
        return;
      }
      opts.onCredential(credential);
    },
    // Never sign someone in without them asking; this app works fine
    // anonymously and a silent sign-in would be a surprise.
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  gis().accounts.id.renderButton(opts.parent, {
    theme: "outline",
    size: "large",
    text: "continue_with",
    shape: "pill",
    ...opts.options,
  });
}

/**
 * Tells Google not to sign this browser straight back in. Called on sign-out,
 * without which the button can immediately re-credential the same account.
 */
export function forgetGoogleSession(): void {
  try {
    gis().accounts.id.disableAutoSelect();
  } catch {
    // Never loaded, or already gone.
  }
}
