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
  | "rate_limited"
  | "internal"
  | "offline";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, status: number, message?: string) {
    super(message ?? code);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
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

// True when the server is asking us to slow down. Deliberately distinct from
// "offline": offline means retry as soon as possible, throttled means the
// exact opposite, and treating them the same turns a rate limit into a
// retry storm.
export function isRateLimited(err: unknown): boolean {
  return err instanceof ApiError && err.code === "rate_limited";
}
