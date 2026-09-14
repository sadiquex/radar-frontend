import type { Participant, Trip, TripInput } from "../types";

// The one interface every screen talks to. Identical in shape to the original
// synchronous `data` object, with every read and write now returning a promise.
//
// `creatorId` and `participantId` stay in the signatures so call sites keep
// their shape, but the HTTP implementation derives identity from the session
// token instead of trusting them. The exception is the scripted demo convoy,
// whose `demo-*` ids genuinely name someone other than the caller.
export interface DataClient {
  createTrip(input: TripInput, creatorId: string): Promise<Trip>;
  getTripByCode(code: string): Promise<Trip | null>;
  /**
   * How many people have joined, by share code.
   *
   * Exists because the Share screen shows this to the creator *before* they
   * have joined, so it cannot come from the roster — reading that requires
   * membership. Returns 0 for a trip that is gone.
   */
  countMembers(code: string): Promise<number>;
  getTripById(id: string): Promise<Trip | null>;
  listParticipants(tripId: string): Promise<Participant[]>;
  joinTrip(tripId: string, participantId: string, displayName: string): Promise<Participant>;
  updatePosition(
    tripId: string,
    participantId: string,
    pos: { lat: number; lng: number }
  ): Promise<Participant>;
  leaveTrip(tripId: string, participantId: string): Promise<void>;
  endTrip(tripId: string): Promise<void>;
  subscribe(tripId: string, onChange: () => void): () => void;
}

// The closed set of error codes the API returns. Screens branch on these
// rather than on HTTP status numbers or message strings.
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "ended"
  | "expired"
  | "invalid"
  | "trip_full"
  | "already_in_trip"
  | "rate_limited"
  | "internal"
  | "offline";

/** The trip a device is already riding, as named by an `already_in_trip`. */
export interface OccupiedTrip {
  id: string;
  name: string | null;
  shareCode: string;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  /**
   * The server's `detail`, untyped because most codes do not carry one and
   * the shapes differ per code. Read it through a narrowing helper —
   * `occupiedTrip` below — rather than casting at the call site.
   */
  readonly detail: unknown;

  constructor(code: ApiErrorCode, status: number, message?: string, detail?: unknown) {
    super(message ?? code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

// True when the trip is gone for good — expired, ended, or never existed.
// Callers use this to stop writing positions and show the Ended screen.
export function isTripGone(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === "ended" || err.code === "expired" || err.code === "not_found")
  );
}

// True when this device is no longer a member — it left, or was purged.
export function isNotMember(err: unknown): boolean {
  return err instanceof ApiError && err.code === "forbidden";
}

// True when this device is already riding somewhere else.
//
// Deliberately distinct from `trip_full`, which arrives from the same endpoint
// with the same 409 and means the opposite kind of thing: a full trip is about
// the trip and there is nothing to offer the rider, while this is about us and
// is entirely fixable by leaving.
export function isAlreadyInTrip(err: unknown): boolean {
  return err instanceof ApiError && err.code === "already_in_trip";
}

/**
 * The trip named by an `already_in_trip`, or null if it did not name one.
 *
 * Narrowed rather than cast: the screen offers to remove somebody from a trip
 * on the strength of this, so a malformed payload must read as "we don't know
 * which trip" and not as an object with undefined fields that renders "Leave
 * undefined?" and then leaves the wrong thing.
 */
export function occupiedTrip(err: unknown): OccupiedTrip | null {
  if (!(err instanceof ApiError)) return null;
  const d = err.detail;
  if (typeof d !== "object" || d === null) return null;
  const { id, name, shareCode } = d as Record<string, unknown>;
  if (typeof id !== "string" || typeof shareCode !== "string") return null;
  if (name !== null && typeof name !== "string") return null;
  return { id, name, shareCode };
}

// True when the server is asking us to slow down. Deliberately distinct from
// "offline": offline means retry as soon as possible, throttled means the
// exact opposite, and treating them the same turns a rate limit into a
// retry storm.
export function isRateLimited(err: unknown): boolean {
  return err instanceof ApiError && err.code === "rate_limited";
}
