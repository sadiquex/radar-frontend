/**
 * What the join screen should do about a failed join.
 *
 * Pure, and separate from `JoinFlow` for the same reason `verdict.ts` and
 * `status.ts` are separate from the screens that render them: this is the
 * decision, and the component is only the drawing of it. It is also the only
 * part worth testing — the repo has no component-testing setup because the
 * intelligence is deliberately kept out of the JSX.
 */

import { ApiError, isAlreadyInTrip, occupiedTrip, type OccupiedTrip } from "./data/types";

export type JoinOutcome =
  | { kind: "message"; text: string }
  | { kind: "switch"; occupied: OccupiedTrip };

const message = (text: string): JoinOutcome => ({ kind: "message", text });

export function joinOutcome(err: unknown): JoinOutcome {
  if (isAlreadyInTrip(err)) {
    const occupied = occupiedTrip(err);
    // An offer to leave a trip we cannot name is an offer we cannot honour:
    // the confirm would read "Leave undefined?" and the leave would have no
    // id to send. A plain refusal is the honest fallback.
    return occupied === null
      ? message("You're already in a trip. Leave it before joining another.")
      : { kind: "switch", occupied };
  }

  if (!(err instanceof ApiError)) return message("Couldn't join that trip. Try again.");

  switch (err.code) {
    case "trip_full":
      return message("This trip is full.");
    case "ended":
    case "expired":
      return message("That trip has already ended.");
    case "offline":
      return message("You appear to be offline.");
    default:
      return message("Couldn't join that trip. Try again.");
  }
}
