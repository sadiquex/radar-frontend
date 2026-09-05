/**
 * Web Push on the client.
 *
 * Today's notifications only exist while the tab is alive, which is the wrong
 * shape for a product used with the phone in a pocket or on a bar mount. This
 * registers a service worker so the group can still reach you with the screen
 * off.
 *
 * The honest caveat: alerts are triggered by whichever device *notices* a
 * status change, and a device only notices while it is running. If every
 * screen in the group is off, nobody computes and nobody is notified.
 */

export const SERVICE_WORKER_URL = "/sw.js";

/** PushManager wants the application server key as raw bytes; VAPID ships base64url. */
export function vapidKeyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  if (base64Url.length === 0) throw new Error("Missing VAPID public key");
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), "=");
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Backed by an explicit ArrayBuffer: PushManager wants an ArrayBufferView
  // over one, and the bare `new Uint8Array(n)` form is typed over the wider
  // ArrayBufferLike, which includes SharedArrayBuffer and is rejected.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export interface PushKeys {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

/**
 * iOS Safari delivers Web Push only to a PWA added to the Home Screen. On a
 * normal Safari tab `PushManager` is absent, so `pushSupported()` is already
 * false — this exists so the UI can explain *why* rather than just refusing.
 */
export function needsHomeScreenInstall(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  if (!isIos) return false;
  const standalone = (navigator as { standalone?: boolean }).standalone === true;
  return !standalone;
}

function toPushKeys(subscription: PushSubscription): PushKeys {
  const json = subscription.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  const endpoint = json.endpoint ?? subscription.endpoint;
  const p256dh = json.keys?.p256dh ?? "";
  const auth = json.keys?.auth ?? "";
  if (endpoint === "" || p256dh === "" || auth === "") {
    throw new Error("Push subscription is missing its keys");
  }
  return { endpoint, keys: { p256dh, auth } };
}

/**
 * Registers the worker, asks permission, and subscribes.
 * Returns null when the user declines — that is a normal outcome, not an error.
 */
export async function enablePush(vapidPublicKey: string): Promise<PushKeys | null> {
  if (!pushSupported()) return null;

  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
  await navigator.serviceWorker.ready;

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") return null;

  // Reuse an existing subscription rather than churning endpoints on every
  // toggle; the server upserts by device either way.
  const existing = await registration.pushManager.getSubscription();
  if (existing !== null) return toPushKeys(existing);

  const subscription = await registration.pushManager.subscribe({
    // Required by Chrome: a push that shows nothing is not allowed.
    userVisibleOnly: true,
    applicationServerKey: vapidKeyToBytes(vapidPublicKey),
  });
  return toPushKeys(subscription);
}

/** Unsubscribes this browser. Safe to call when nothing is subscribed. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
}
