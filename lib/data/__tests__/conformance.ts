import { describe, it, expect } from "vitest";
import type { DataClient } from "../types";

export interface Harness {
  data: DataClient;
  /** The id this client writes as — a device id over HTTP, anything locally. */
  myId: string;
}

/**
 * The behaviour every DataClient must share, run against each implementation.
 *
 * The whole premise of the swap is that screens cannot tell the local store
 * from the API. That only holds if something checks, and checking each
 * implementation against its own expectations would not catch a divergence.
 */
export function describeDataClient(
  name: string,
  setup: () => Promise<Harness>,
  opts: { subscribeWaitMs?: number } = {}
) {
  const subscribeWaitMs = opts.subscribeWaitMs ?? 0;
  // An implementation that falls back to polling needs longer than vitest's
  // 5s default. Stated here so the suite does not depend on a CLI flag.
  const subscribeTimeout = subscribeWaitMs + 10_000;

  describe(`${name} — DataClient contract`, () => {
    it("creates a trip with a share code and an 8 hour life", async () => {
      const { data, myId } = await setup();
      const trip = await data.createTrip({ name: "Road Trip" }, myId);
      expect(trip.shareCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
      expect(trip.name).toBe("Road Trip");
      expect(trip.expiresAt - trip.createdAt).toBe(8 * 60 * 60 * 1000);
      expect(trip.endedAt).toBeNull();
    });

    it("leaves an unnamed trip's optional fields null", async () => {
      const { data, myId } = await setup();
      const trip = await data.createTrip({}, myId);
      expect(trip.name).toBeNull();
      expect(trip.destinationName).toBeNull();
      expect(trip.destinationLat).toBeNull();
      expect(trip.destinationLng).toBeNull();
    });

    it("stores a destination", async () => {
      const { data, myId } = await setup();
      const trip = await data.createTrip(
        { destinationName: "Kumasi", destinationLat: 6.6885, destinationLng: -1.6244 },
        myId
      );
      expect(trip.destinationName).toBe("Kumasi");
      expect(trip.destinationLat).toBeCloseTo(6.6885, 4);
    });

    it("finds a trip by its code", async () => {
      const { data, myId } = await setup();
      const made = await data.createTrip({}, myId);
      const found = await data.getTripByCode(made.shareCode);
      expect(found?.id).toBe(made.id);
    });

    it("finds a trip by a lowercased code", async () => {
      const { data, myId } = await setup();
      const made = await data.createTrip({}, myId);
      const found = await data.getTripByCode(made.shareCode.toLowerCase());
      expect(found?.id).toBe(made.id);
    });

    it("finds a trip by a code with stray whitespace", async () => {
      // The Join screen submits the field value as typed, so a pasted code
      // arrives padded.
      const { data, myId } = await setup();
      const made = await data.createTrip({}, myId);
      const found = await data.getTripByCode(`  ${made.shareCode} `);
      expect(found?.id).toBe(made.id);
    });

    it("reports no trip for an unknown code", async () => {
      const { data } = await setup();
      expect(await data.getTripByCode("ZZZZZZ")).toBeNull();
    });

    it("reports no trip for a code that could never be valid", async () => {
      const { data } = await setup();
      expect(await data.getTripByCode("nope")).toBeNull();
    });

    it("counts members by share code without needing to be one", async () => {
      // The Share screen's case exactly: the creator watches people arrive
      // before going through the name step themselves.
      const { data, myId } = await setup();
      const made = await data.createTrip({}, myId);
      expect(await data.countMembers(made.shareCode)).toBe(0);

      await data.joinTrip(made.id, myId, "Ama");
      expect(await data.countMembers(made.shareCode)).toBe(1);

      await data.joinTrip(made.id, "demo-kofi", "Kofi");
      expect(await data.countMembers(made.shareCode)).toBe(2);
    });

    it("counts zero for a code that is not a trip", async () => {
      const { data } = await setup();
      expect(await data.countMembers("ZZZZZZ")).toBe(0);
      expect(await data.countMembers("nope")).toBe(0);
    });

    it("counts zero once the trip has ended", async () => {
      const { data, myId } = await setup();
      const made = await data.createTrip({}, myId);
      await data.joinTrip(made.id, myId, "Ama");
      await data.endTrip(made.id);
      expect(await data.countMembers(made.shareCode)).toBe(0);
    });

    it("finds a trip by id, for a member", async () => {
      // Membership first, because that is the only way this is ever called:
      // getTripById is the group view's liveness re-check, and the group view
      // redirects non-members to the join step. The API refuses a non-member
      // outright; the local store would happily answer, which is the laxer
      // behaviour of the two and not the one to standardise on.
      const { data, myId } = await setup();
      const made = await data.createTrip({}, myId);
      await data.joinTrip(made.id, myId, "Ama");
      expect((await data.getTripById(made.id))?.shareCode).toBe(made.shareCode);
    });

    it("adds a member with no position yet", async () => {
      const { data, myId } = await setup();
      const trip = await data.createTrip({}, myId);
      const me = await data.joinTrip(trip.id, myId, "Ama");
      expect(me.id).toBe(myId);
      expect(me.displayName).toBe("Ama");
      expect(me.latitude).toBeNull();
      expect(me.longitude).toBeNull();
      expect(me.lastMovedAt).toBeNull();
    });

    it("always reports status as null, because the client derives it", async () => {
      const { data, myId } = await setup();
      const trip = await data.createTrip({}, myId);
      const me = await data.joinTrip(trip.id, myId, "Ama");
      expect(me.status).toBeNull();
    });

    it("renames rather than duplicating when a member rejoins", async () => {
      const { data, myId } = await setup();
      const trip = await data.createTrip({}, myId);
      await data.joinTrip(trip.id, myId, "Ama");
      await data.joinTrip(trip.id, myId, "Ama K.");
      const members = await data.listParticipants(trip.id);
      expect(members).toHaveLength(1);
      expect(members[0].displayName).toBe("Ama K.");
    });

    it("keeps a member's position when they rejoin", async () => {
      const { data, myId } = await setup();
      const trip = await data.createTrip({}, myId);
      await data.joinTrip(trip.id, myId, "Ama");
      await data.updatePosition(trip.id, myId, { lat: 5.6037, lng: -0.187 });
      const again = await data.joinTrip(trip.id, myId, "Ama");
      expect(again.latitude).toBeCloseTo(5.6037, 4);
    });

    it("stores a position and stamps lastMovedAt on the first fix", async () => {
      const { data, myId } = await setup();
      const trip = await data.createTrip({}, myId);
      await data.joinTrip(trip.id, myId, "Ama");
      const p = await data.updatePosition(trip.id, myId, { lat: 5.6037, lng: -0.187 });
      expect(p.latitude).toBeCloseTo(5.6037, 4);
      expect(p.longitude).toBeCloseTo(-0.187, 4);
      expect(typeof p.lastMovedAt).toBe("number");
    });

    it("does not advance lastMovedAt for jitter under 20 metres", async () => {
      // The single rule that makes "stopped" detectable from real GPS.
      const { data, myId } = await setup();
      const trip = await data.createTrip({}, myId);
      await data.joinTrip(trip.id, myId, "Ama");
      const first = await data.updatePosition(trip.id, myId, { lat: 5.6037, lng: -0.187 });
      const jittered = await data.updatePosition(trip.id, myId, {
        lat: 5.6037 + 0.00009, // ~10m
        lng: -0.187,
      });
      expect(jittered.lastMovedAt).toBe(first.lastMovedAt);
      // ...but the new coordinates are still recorded.
      expect(jittered.latitude).toBeCloseTo(5.6037 + 0.00009, 6);
    });

    it("lists members of the requested trip only", async () => {
      const { data, myId } = await setup();
      const a = await data.createTrip({}, myId);
      const b = await data.createTrip({}, myId);
      await data.joinTrip(a.id, myId, "Ama");
      expect(await data.listParticipants(a.id)).toHaveLength(1);
      expect(await data.listParticipants(b.id)).toHaveLength(0);
    });

    it("removes the leaver from the trip", async () => {
      // Only the portable half is asserted here. Once you leave you are no
      // longer a member, so the API stops showing you the roster at all —
      // correctly, since that is the privacy rule. "Everyone else stays" is
      // therefore checked in the backend's own tests, where two real devices
      // are available to observe it.
      const { data, myId } = await setup();
      const trip = await data.createTrip({}, myId);
      await data.joinTrip(trip.id, myId, "Ama");
      await data.joinTrip(trip.id, "demo-kofi", "Kofi");

      expect((await data.listParticipants(trip.id)).map((p) => p.id)).toContain(myId);
      await data.leaveTrip(trip.id, myId);
      expect((await data.listParticipants(trip.id)).map((p) => p.id)).not.toContain(myId);
    });

    it("makes an ended trip unreadable by code and by id", async () => {
      const { data, myId } = await setup();
      const trip = await data.createTrip({}, myId);
      await data.joinTrip(trip.id, myId, "Ama");
      await data.endTrip(trip.id);
      expect(await data.getTripByCode(trip.shareCode)).toBeNull();
      expect(await data.getTripById(trip.id)).toBeNull();
    });

    it("notifies a subscriber when the trip changes", async () => {
      const { data, myId } = await setup();
      const trip = await data.createTrip({}, myId);
      await data.joinTrip(trip.id, myId, "Ama");

      let fired = 0;
      const unsub = data.subscribe(trip.id, () => {
        fired += 1;
      });
      try {
        await data.joinTrip(trip.id, "demo-kofi", "Kofi");
        if (subscribeWaitMs > 0) {
          await new Promise((r) => setTimeout(r, subscribeWaitMs));
        }
        expect(fired).toBeGreaterThan(0);
      } finally {
        unsub();
      }
    }, subscribeTimeout);

    it("stops notifying after unsubscribe", async () => {
      const { data, myId } = await setup();
      const trip = await data.createTrip({}, myId);
      await data.joinTrip(trip.id, myId, "Ama");

      let fired = 0;
      const unsub = data.subscribe(trip.id, () => {
        fired += 1;
      });
      unsub();
      await data.joinTrip(trip.id, "demo-esi", "Esi");
      if (subscribeWaitMs > 0) await new Promise((r) => setTimeout(r, subscribeWaitMs));
      expect(fired).toBe(0);
    }, subscribeTimeout);
  });
}
