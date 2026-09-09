import { describe, it, expect } from "vitest";
import {
  UNTITLED, arrivalSummary, formatDay, formatDuration, formatRemaining,
  groupByMonth, liveOnly, outcomeOf, tripTitle,
} from "../history";
import type { LiveTripEntry, PastTripEntry, TripEntry } from "../data/history";

const AT = (iso: string) => new Date(iso).getTime();
const NOW = AT("2026-09-08T12:00:00Z");

const past = (over: Partial<PastTripEntry> = {}): PastTripEntry => ({
  kind: "past",
  tripId: over.tripId ?? "t1",
  name: "Sunday ride",
  destinationName: "Kumasi",
  destinationLat: 6.6885,
  destinationLng: -1.6244,
  startedAt: AT("2026-09-06T08:00:00Z"),
  finishedAt: AT("2026-09-06T11:30:00Z"),
  finishReason: "ended",
  wasCreator: true,
  youLeftEarly: false,
  finishers: [{ name: "Ibrahim", arrived: true }],
  ...over,
});

const live = (over: Partial<LiveTripEntry> = {}): LiveTripEntry => ({
  kind: "live",
  tripId: "live1",
  shareCode: "ABC234",
  name: "Right now",
  destinationName: null,
  memberCount: 3,
  startedAt: AT("2026-09-08T10:00:00Z"),
  expiresAt: AT("2026-09-08T18:00:00Z"),
  wasCreator: false,
  pulse: null,
  ...over,
});

describe("tripTitle", () => {
  it("uses the trip's name", () => {
    expect(tripTitle(past())).toBe("Sunday ride");
  });

  it("falls back for a trip nobody named", () => {
    // Trip names are optional, so the untitled case is common rather than odd.
    expect(tripTitle(past({ name: null }))).toBe(UNTITLED);
  });

  it("treats a name of spaces as no name", () => {
    expect(tripTitle(past({ name: "   " }))).toBe(UNTITLED);
  });
});

describe("outcomeOf", () => {
  it("is arrived when everyone who finished got there", () => {
    expect(outcomeOf(past())).toBe("arrived");
  });

  it("is behind when somebody did not", () => {
    expect(
      outcomeOf(
        past({
          finishers: [
            { name: "Ibrahim", arrived: true },
            { name: "Ama", arrived: false },
          ],
        })
      )
    ).toBe("behind");
  });

  it("is stopped when the trip had no destination", () => {
    // Nobody failed to arrive; there was nowhere to arrive. Rendering that as
    // a failure would be a claim nobody made.
    expect(outcomeOf(past({ finishers: [{ name: "Ibrahim", arrived: null }] }))).toBe("stopped");
  });

  it("has nothing to say about a running trip", () => {
    expect(outcomeOf(live())).toBeNull();
  });

  it("has nothing to say about an empty roster", () => {
    expect(outcomeOf(past({ finishers: [] }))).toBeNull();
  });
});

describe("arrivalSummary", () => {
  it("counts only the answerable", () => {
    expect(
      arrivalSummary([
        { name: "A", arrived: true },
        { name: "B", arrived: false },
        // No destination for this one, so it is not part of the denominator.
        { name: "C", arrived: null },
      ])
    ).toBe("1 of 2 arrived");
  });

  it("says so when everyone made it", () => {
    expect(arrivalSummary([{ name: "A", arrived: true }])).toBe("Everyone arrived");
  });

  it("is null when nothing is answerable", () => {
    expect(arrivalSummary([{ name: "A", arrived: null }])).toBeNull();
    expect(arrivalSummary([])).toBeNull();
  });
});

describe("formatDuration", () => {
  it("uses minutes under an hour", () => {
    expect(formatDuration(0, 42 * 60_000)).toBe("42 min");
  });

  it("drops the minutes when there are none", () => {
    expect(formatDuration(0, 120 * 60_000)).toBe("2h");
  });

  it("shows hours and minutes together", () => {
    expect(formatDuration(0, 150 * 60_000)).toBe("2h 30m");
  });

  it("never goes negative on a trip whose clocks disagree", () => {
    expect(formatDuration(1000, 0)).toBe("0 min");
  });
});

describe("formatRemaining", () => {
  it("counts down in minutes, then hours", () => {
    expect(formatRemaining(NOW + 20 * 60_000, NOW)).toBe("20 min left");
    expect(formatRemaining(NOW + 3 * 3_600_000, NOW)).toBe("3h left");
  });

  it("says expiring rather than a negative number", () => {
    expect(formatRemaining(NOW - 60_000, NOW)).toBe("expiring");
  });
});

describe("formatDay", () => {
  it("omits the year within the current one", () => {
    expect(formatDay(AT("2026-09-06T08:00:00Z"), NOW)).toBe("6 Sep");
  });

  it("includes it otherwise", () => {
    expect(formatDay(AT("2025-12-31T08:00:00Z"), NOW)).toBe("31 Dec 2025");
  });
});

describe("groupByMonth", () => {
  it("cuts a new group when the month changes", () => {
    const trips: TripEntry[] = [
      past({ tripId: "a", startedAt: AT("2026-09-06T08:00:00Z") }),
      past({ tripId: "b", startedAt: AT("2026-09-01T08:00:00Z") }),
      past({ tripId: "c", startedAt: AT("2026-08-20T08:00:00Z") }),
    ];
    const groups = groupByMonth(trips, NOW);
    expect(groups.map((g) => g.heading)).toEqual(["September", "August"]);
    expect(groups[0]!.trips.map((t) => t.tripId)).toEqual(["a", "b"]);
  });

  it("keeps the server's order rather than re-sorting", () => {
    // The cursor's correctness depends on this order. Bucketing and re-sorting
    // would silently reorder a page and make "show older" skip rows.
    const trips: TripEntry[] = [
      past({ tripId: "older", startedAt: AT("2026-09-01T08:00:00Z") }),
      past({ tripId: "newer", startedAt: AT("2026-09-06T08:00:00Z") }),
    ];
    expect(groupByMonth(trips, NOW)[0]!.trips.map((t) => t.tripId)).toEqual(["older", "newer"]);
  });

  it("names the year on a month outside this one", () => {
    const groups = groupByMonth([past({ startedAt: AT("2025-09-06T08:00:00Z") })], NOW);
    expect(groups[0]!.heading).toBe("September 2025");
  });

  it("leaves running trips out — they have their own section", () => {
    expect(groupByMonth([live()], NOW)).toEqual([]);
  });

  it("reopens a month that recurs in a different year", () => {
    // September 2026 and September 2025 are different headings, so a list that
    // spans a year boundary must not merge them.
    const groups = groupByMonth(
      [
        past({ tripId: "a", startedAt: AT("2026-09-06T08:00:00Z") }),
        past({ tripId: "b", startedAt: AT("2025-09-06T08:00:00Z") }),
      ],
      NOW
    );
    expect(groups.map((g) => g.heading)).toEqual(["September", "September 2025"]);
  });
});

describe("liveOnly", () => {
  it("picks the running trips out of a page", () => {
    const found = liveOnly([past(), live(), past({ tripId: "x" })]);
    expect(found).toHaveLength(1);
    expect(found[0]!.shareCode).toBe("ABC234");
  });
});
