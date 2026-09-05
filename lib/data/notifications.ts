import type { Session } from "../session";
import type { StatusKey } from "../types";
import type { PushKeys } from "../push";

/**
 * Push subscriptions and status reports.
 *
 * Kept apart from DataClient on purpose: that interface is about the trip, and
 * both implementations of it have to satisfy the same contract. This is a
 * best-effort side channel with different rules — a lost report costs a
 * notification, not correctness.
 */
export interface NotificationsClient {
  subscribe(keys: PushKeys): Promise<void>;
  unsubscribe(): Promise<void>;
  /** Tells the server a member's status changed. Never throws. */
  report(tripId: string, participantId: string, status: StatusKey): Promise<void>;
}

export interface NotificationsDeps {
  baseUrl: string;
  session: { get: () => Promise<Session> };
  fetchFn?: typeof fetch;
}

export function createNotificationsClient(deps: NotificationsDeps): NotificationsClient {
  const doFetch = deps.fetchFn ?? globalThis.fetch;
  // What this device has already told the server, so a re-render with no real
  // change does not cost a round trip. The server de-duplicates across the
  // whole group; this is just the local half.
  const reported = new Map<string, StatusKey>();

  async function send(path: string, init: { method: string; body?: unknown }): Promise<Response> {
    const { token } = await deps.session.get();
    return doFetch(`${deps.baseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  }

  return {
    async subscribe(keys: PushKeys): Promise<void> {
      // The user is watching this one: the bell must not claim alerts are on
      // when the server never stored the subscription.
      const res = await send("/v1/push/subscriptions", { method: "POST", body: keys });
      if (!res.ok) throw new Error(`Could not enable alerts (${res.status})`);
    },

    async unsubscribe(): Promise<void> {
      await send("/v1/push/subscriptions", { method: "DELETE" }).catch(() => undefined);
    },

    async report(tripId: string, participantId: string, status: StatusKey): Promise<void> {
      const key = `${tripId}:${participantId}`;
      if (reported.get(key) === status) return;
      reported.set(key, status);
      try {
        // Deliberately only a status. The server renders the words, so a
        // member cannot push arbitrary text at the rest of the group.
        await send(`/v1/trips/${tripId}/alerts`, {
          method: "POST",
          body: { participantId, status },
        });
      } catch {
        // An alert is a nicety on top of a screen that is already correct.
      }
    },
  };
}

/** Used when there is no API configured. Accepts everything, does nothing. */
export const offlineNotifications: NotificationsClient = {
  async subscribe() {},
  async unsubscribe() {},
  async report() {},
};
