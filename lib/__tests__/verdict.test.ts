import { describe, it, expect } from "vitest";
import { computeVerdict } from "../verdict";
import type { MemberStatus } from "../status";
import type { Participant, StatusKey } from "../types";

const NOW = 1_700_000_000_000;

function p(id: string, displayName: string, lastMovedAt: number | null = NOW): Participant {
  return {
    id,
    tripId: "t1",
    displayName,
    latitude: 5.6,
    longitude: -0.18,
    status: null,
    lastMovedAt,
    lastSeenAt: NOW,
  };
}

const st = (entries: Record<string, [StatusKey, number]>): Record<string, MemberStatus> =>
  Object.fromEntries(
    Object.entries(entries).map(([id, [status, kmLeft]]) => [id, { status, kmLeft }])
  );

const run = (
  participants: Participant[],
  statuses: Record<string, MemberStatus>,
  selfId = "me",
  destinationName: string | null = "Aburi",
  now = NOW
) => computeVerdict({ participants, statuses, selfId, destinationName, now });

describe("computeVerdict — degenerate cases", () => {
  it("waits when nobody has a position", () => {
    const v = run([p("me", "Ibrahim")], st({}));
    expect(v).toMatchObject({ tone: "waiting", headline: "Waiting for locations", status: null });
  });

  it("waits when only you are located, rather than claiming the group is together", () => {
    const v = run([p("me", "Ibrahim"), p("k", "Kofi")], st({ me: ["with", 9] }));
    expect(v).toMatchObject({ tone: "waiting", headline: "Just you so far" });
  });

  it("names the lone sharer when it is not you", () => {
    const v = run([p("me", "Ibrahim"), p("k", "Kofi")], st({ k: ["with", 9] }));
    expect(v.headline).toBe("Only Kofi is sharing");
  });
});

describe("computeVerdict — precedence", () => {
  const four = [p("me", "Ibrahim"), p("k", "Kofi"), p("e", "Esi"), p("y", "Yaw")];

  it("puts stopped above everything else", () => {
    const v = run(
      four,
      st({ me: ["with", 9], k: ["ahead", 2], e: ["behind", 15], y: ["stopped", 11] })
    );
    expect(v).toMatchObject({ tone: "alarm", status: "stopped", headline: "Yaw stopped", subjectId: "y" });
  });

  it("puts behind above arrived and ahead", () => {
    const v = run(four, st({ me: ["with", 9], k: ["arrived", 0], e: ["behind", 15], y: ["ahead", 3] }));
    expect(v).toMatchObject({ tone: "attention", status: "behind", subjectId: "e" });
  });

  it("puts arrived above ahead", () => {
    const v = run(four, st({ me: ["with", 9], k: ["arrived", 0], y: ["ahead", 3] }));
    expect(v).toMatchObject({ tone: "info", status: "arrived", headline: "Kofi has arrived" });
  });

  it("reports everyone arriving as one calm statement", () => {
    const v = run(four, st({ me: ["arrived", 0], k: ["arrived", 0], e: ["arrived", 0] }));
    expect(v).toMatchObject({ tone: "calm", headline: "Everyone's here", subjectId: null });
  });

  it("falls through to all-together with distance to the destination", () => {
    const v = run(four, st({ me: ["with", 9.1], k: ["with", 9.4], e: ["with", 8.8] }));
    expect(v).toMatchObject({
      tone: "calm",
      headline: "All together",
      metric: "9.1",
      metricLabel: "KM TO ABURI",
    });
  });
});

describe("computeVerdict — subject selection and distance", () => {
  const five = [p("me", "Ibrahim"), p("a", "Ama"), p("b", "Bola"), p("c", "Kojo")];

  it("names the furthest member when several share the worst status", () => {
    const v = run(five, st({ me: ["with", 9], a: ["behind", 12], b: ["behind", 20], c: ["with", 9] }));
    expect(v.subjectId).toBe("b");
    expect(v.headline).toBe("2 riders behind");
    expect(v.metric).toBe("11.0");
  });

  it("measures the gap against you and says so", () => {
    const v = run(five, st({ me: ["with", 9], a: ["behind", 11.1], b: ["with", 9], c: ["with", 9] }));
    expect(v.headline).toBe("Ama is 2.1 km back");
    expect(v.metricLabel).toBe("KM BEHIND YOU");
  });

  it("measures against the group when you have no position", () => {
    const v = run(five, st({ a: ["behind", 12], b: ["with", 9], c: ["with", 9] }));
    expect(v.metricLabel).toBe("KM BEHIND THE GROUP");
    expect(v.metric).toBe("3.0");
  });

  it("says AHEAD OF for a member closer to the destination", () => {
    const v = run(five, st({ me: ["with", 9], a: ["ahead", 3], b: ["with", 9], c: ["with", 9] }));
    expect(v.metricLabel).toBe("KM AHEAD OF YOU");
    expect(v.headline).toBe("Ama is 6.0 km ahead");
  });

  it("uses the group as reference when the outlier is you", () => {
    const v = run(five, st({ me: ["behind", 20], a: ["with", 9], b: ["with", 9], c: ["with", 9] }));
    expect(v.headline).toBe("You are 11.0 km back");
    expect(v.metricLabel).toBe("KM BEHIND THE GROUP");
  });
});

describe("computeVerdict — second person", () => {
  const three = [p("me", "Ibrahim"), p("a", "Ama"), p("b", "Bola")];

  it("addresses your own stop in second person", () => {
    const v = run(three, st({ me: ["stopped", 11], a: ["with", 9], b: ["with", 9] }));
    expect(v.headline).toBe("You've stopped");
  });

  it("addresses your own arrival in second person", () => {
    const v = run(three, st({ me: ["arrived", 0], a: ["with", 9], b: ["with", 9] }));
    expect(v.headline).toBe("You have arrived");
  });
});

describe("computeVerdict — stopped duration", () => {
  const three = [p("me", "Ibrahim"), p("a", "Ama"), p("b", "Bola")];

  it("appends minutes since last movement", () => {
    const parts = [p("me", "Ibrahim"), p("a", "Ama", NOW - 3 * 60_000), p("b", "Bola")];
    const v = run(parts, st({ me: ["with", 9], a: ["stopped", 11.1], b: ["with", 9] }));
    expect(v.metricLabel).toBe("KM BEHIND YOU · 3 MIN");
  });

  it("floors the duration at one minute rather than showing zero", () => {
    const parts = [p("me", "Ibrahim"), p("a", "Ama", NOW - 5_000), p("b", "Bola")];
    const v = run(parts, st({ me: ["with", 9], a: ["stopped", 11], b: ["with", 9] }));
    expect(v.metricLabel).toContain("1 MIN");
  });

  it("omits the duration when lastMovedAt is unknown", () => {
    const parts = [p("me", "Ibrahim"), p("a", "Ama", null), p("b", "Bola")];
    const v = run(parts, st({ me: ["with", 9], a: ["stopped", 11], b: ["with", 9] }));
    expect(v.metricLabel).toBe("KM BEHIND YOU");
  });
});

describe("computeVerdict — no destination", () => {
  const three = [p("me", "Ibrahim"), p("a", "Ama"), p("b", "Bola")];
  const noDest = (s: Record<string, MemberStatus>) => run(three, s, "me", null);

  it("never prints a 0.0 km distance", () => {
    const v = noDest(st({ me: ["with", 0], a: ["behind", 0], b: ["with", 0] }));
    expect(v.headline).toBe("Ama has fallen behind");
    expect(v.metric).toBeNull();
    expect(v.metricLabel).toBeNull();
  });

  it("still reports a stop, using minutes as the metric", () => {
    const parts = [p("me", "Ibrahim"), p("a", "Ama", NOW - 7 * 60_000), p("b", "Bola")];
    const v = computeVerdict({
      participants: parts,
      statuses: st({ me: ["with", 0], a: ["stopped", 0], b: ["with", 0] }),
      selfId: "me",
      destinationName: null,
      now: NOW,
    });
    expect(v).toMatchObject({ metric: "7", metricLabel: "MIN STOPPED" });
  });

  it("drops the metric from all-together", () => {
    const v = noDest(st({ me: ["with", 0], a: ["with", 0], b: ["with", 0] }));
    expect(v).toMatchObject({ headline: "All together", metric: null, metricLabel: null });
  });
});
