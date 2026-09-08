/**
 * Seed data for the prototype. Not shipped.
 *
 * Follows `admin-frontend/lib/api/fixtures.ts` in intent: every screen is
 * clickable before an endpoint exists, and the UI says out loud that it is
 * running on invented data.
 *
 * The places are real Accra locations and the mix is the point. Four of the
 * twelve are informal — a man under a tree, a footbridge patch guy, a petrol
 * station air line — because that is what bicycle repair in this city actually
 * is, and it is exactly the set OpenStreetMap's `shop=bicycle` does not have.
 * A prototype seeded with tidy bike shops would flatter a design that has to
 * survive messier data than that.
 *
 * The spread of confirmation ages is also deliberate: two points here are
 * stale and one has never been confirmed at all, so the never-auto-hide rule
 * can be judged on screen rather than in the abstract.
 */

import type { RepairPoint } from "./types";

const DAY = 86_400_000;

// Fixed rather than Date.now(): timestamps that move with the clock make the
// labels non-deterministic, and this file is read by a test.
const AUTHORED = Date.UTC(2026, 8, 8);
const daysAgo = (n: number) => AUTHORED - n * DAY;

/** Osu, near Oxford Street — where the prototype pretends you are standing. */
export const DEMO_POSITION = { lat: 5.559, lng: -0.1808 };

export const DEMO_POINTS: RepairPoint[] = [
  {
    id: "rp-osu-clinic",
    name: "Osu Bike Clinic",
    category: "shop",
    lat: 5.5573,
    lng: -0.1823,
    note: "Road and mountain parts, wheel truing. Closed Sundays.",
    phone: "+233 24 431 0982",
    addedAt: daysAgo(310),
    confirmedAt: daysAgo(6),
    confirmations: 14,
  },
  {
    id: "rp-labone-yaw",
    name: "Labone Junction mechanic",
    category: "mechanic",
    lat: 5.5624,
    lng: -0.1748,
    note: "Ask for Yaw. Does gears properly, not just tubes.",
    phone: null,
    addedAt: daysAgo(154),
    confirmedAt: daysAgo(9),
    confirmations: 8,
  },
  {
    id: "rp-shell-osu",
    name: "Shell Osu — air line",
    category: "pump",
    lat: 5.5601,
    lng: -0.1795,
    note: "Free air at the tyre bay. Ask the attendant for the bike adaptor.",
    phone: null,
    addedAt: daysAgo(96),
    confirmedAt: daysAgo(41),
    confirmations: 5,
  },
  {
    id: "rp-circle-tube",
    name: "Circle Tyre & Tube",
    category: "tube",
    lat: 5.5698,
    lng: -0.2062,
    note: "Patches while you wait, 10 cedis. Under the overpass, east side.",
    phone: null,
    addedAt: daysAgo(201),
    confirmedAt: daysAgo(3),
    confirmations: 11,
  },
  {
    id: "rp-circle-kwame",
    name: "Kwame — roadside mechanic",
    category: "mechanic",
    lat: 5.5706,
    lng: -0.2081,
    note: "Under the big tree by the overpass. Cash only, mornings best.",
    phone: null,
    addedAt: daysAgo(133),
    confirmedAt: daysAgo(19),
    confirmations: 6,
  },
  {
    id: "rp-nima-cycles",
    name: "Nima Highway Cycles",
    category: "shop",
    lat: 5.5857,
    lng: -0.1975,
    note: "Second-hand frames, brake cables, tubes in most sizes.",
    phone: "+233 20 776 4413",
    addedAt: daysAgo(240),
    confirmedAt: daysAgo(27),
    confirmations: 9,
  },
  {
    id: "rp-accra-mall",
    name: "Accra Mall service yard tap",
    category: "water",
    lat: 5.6213,
    lng: -0.1712,
    note: "Tap behind the loading bay. Bring your own bottle.",
    phone: null,
    addedAt: daysAgo(74),
    confirmedAt: daysAgo(31),
    confirmations: 3,
  },
  {
    id: "rp-achimota-works",
    name: "Achimota Cycle Works",
    category: "shop",
    lat: 5.6183,
    lng: -0.2274,
    note: "The only place north of Circle that stocks 700c tubes.",
    phone: "+233 27 512 6640",
    addedAt: daysAgo(288),
    confirmedAt: daysAgo(33),
    confirmations: 12,
  },
  {
    id: "rp-madina-market",
    name: "Madina Market repairs",
    category: "mechanic",
    lat: 5.6841,
    lng: -0.1667,
    note: "Row of three mechanics at the north gate. One of them is always in.",
    phone: null,
    addedAt: daysAgo(180),
    confirmedAt: daysAgo(12),
    confirmations: 7,
  },
  {
    id: "rp-legon-tap",
    name: "Legon Sports Complex tap",
    category: "water",
    lat: 5.6512,
    lng: -0.1861,
    note: "By the changing rooms. Locked outside term time.",
    phone: null,
    addedAt: daysAgo(160),
    confirmedAt: daysAgo(88),
    confirmations: 2,
  },
  // ── The two that test the never-hide rule ────────────────────────────────
  {
    id: "rp-airport-total",
    name: "Airport Res. pump (Total)",
    category: "pump",
    lat: 5.6046,
    lng: -0.1783,
    note: "Air line by the car wash.",
    phone: null,
    addedAt: daysAgo(420),
    confirmedAt: daysAgo(240),
    confirmations: 1,
  },
  {
    id: "rp-kaneshie-patch",
    name: "Kaneshie footbridge patch guy",
    category: "tube",
    lat: 5.5677,
    lng: -0.2358,
    note: "Mornings only, packs up by 2pm.",
    phone: null,
    addedAt: daysAgo(210),
    confirmedAt: null,
    confirmations: 0,
  },
];
