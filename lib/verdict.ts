import type { MemberStatus } from "./status";
import type { Participant, StatusKey } from "./types";

export type VerdictTone = "alarm" | "attention" | "info" | "calm" | "waiting";

/**
 * The one thing to read on the Group screen. A rider at effort processes two or
 * three numbers, so the screen leads with a single sentence answering "do I
 * need to do anything" and everything else is supporting detail.
 *
 * Glance mode is a second rendering of this same value — no separate logic.
 */
export interface Verdict {
  tone: VerdictTone;
  eyebrow: string;
  headline: string;
  metric: string | null;
  metricLabel: string | null;
  status: StatusKey | null;
  subjectId: string | null;
}

export interface VerdictInput {
  participants: Participant[];
  statuses: Record<string, MemberStatus>;
  selfId: string;
  destinationName: string | null;
  now: number;
}

// Severity order. Stopped needs action, behind needs attention, arriving is
// news, pulling ahead is merely information.
const SEVERITY: StatusKey[] = ["stopped", "behind", "arrived", "ahead"];

const EYEBROW: Record<StatusKey, string> = {
  stopped: "NEEDS YOU",
  behind: "HEADS UP",
  arrived: "ARRIVED",
  ahead: "AHEAD",
  with: "ALL GOOD",
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const plural = (n: number) => (n === 1 ? "rider" : "riders");

export function computeVerdict({
  participants,
  statuses,
  selfId,
  destinationName,
  now,
}: VerdictInput): Verdict {
  // computeStatuses omits members with no position, so presence == located.
  const located = participants.filter((p) => statuses[p.id]);

  if (located.length === 0) {
    return {
      tone: "waiting",
      eyebrow: "WAITING",
      headline: "Waiting for locations",
      metric: null,
      metricLabel: null,
      status: null,
      subjectId: null,
    };
  }

  // One position is not a group: every status would read "with group", which
  // would claim the group is together when there is nobody to be together with.
  if (located.length === 1) {
    const only = located[0];
    return {
      tone: "waiting",
      eyebrow: "WAITING",
      headline: only.id === selfId ? "Just you so far" : `Only ${only.displayName} is sharing`,
      metric: null,
      metricLabel: null,
      status: null,
      subjectId: only.id,
    };
  }

  // Distances are only meaningful relative to a destination; without one,
  // status.ts leaves every kmLeft at 0.
  const hasDistances = destinationName !== null || located.some((p) => statuses[p.id].kmLeft > 0);
  const selfStatus = statuses[selfId];
  const selfLocated = Boolean(selfStatus);

  if (located.every((p) => statuses[p.id].status === "arrived")) {
    return {
      tone: "calm",
      eyebrow: "ARRIVED",
      headline: "Everyone's here",
      metric: null,
      metricLabel: null,
      status: "arrived",
      subjectId: null,
    };
  }

  for (const key of SEVERITY) {
    const group = located.filter((p) => statuses[p.id].status === key);
    if (group.length === 0) continue;

    // Reference point for "how far apart are we". Measuring the viewer against
    // themselves is meaningless, so fall back to the rest of the group.
    const useGroupReference = !selfLocated || group.some((p) => p.id === selfId);
    const reference = useGroupReference
      ? median(located.filter((p) => p.id !== selfId).map((p) => statuses[p.id].kmLeft))
      : selfStatus.kmLeft;

    // Among equally-bad members, the furthest one is the one worth naming.
    const subject = [...group].sort(
      (a, b) =>
        Math.abs(statuses[b.id].kmLeft - reference) - Math.abs(statuses[a.id].kmLeft - reference)
    )[0];

    const isSelf = subject.id === selfId;
    const name = isSelf ? "You" : subject.displayName;
    const gap = Math.abs(statuses[subject.id].kmLeft - reference);
    const behind = statuses[subject.id].kmLeft > reference;
    const anchor = useGroupReference ? "THE GROUP" : "YOU";

    const minutes =
      subject.lastMovedAt != null
        ? Math.max(1, Math.floor((now - subject.lastMovedAt) / 60_000))
        : null;

    let headline: string;
    let metric: string | null = null;
    let metricLabel: string | null = null;

    if (hasDistances) {
      metric = gap.toFixed(1);
      metricLabel = `${behind ? "KM BEHIND" : "KM AHEAD OF"} ${anchor}`;
    }

    switch (key) {
      case "stopped":
        headline = group.length > 1 ? `${group.length} riders stopped` : isSelf ? "You've stopped" : `${name} stopped`;
        if (minutes != null) {
          metricLabel = metricLabel ? `${metricLabel} · ${minutes} MIN` : "MIN STOPPED";
          if (metric == null) metric = String(minutes);
        }
        break;
      case "behind":
        headline =
          group.length > 1
            ? `${group.length} ${plural(group.length)} behind`
            : hasDistances
            ? `${name} ${isSelf ? "are" : "is"} ${gap.toFixed(1)} km back`
            : `${name} ${isSelf ? "have" : "has"} fallen behind`;
        break;
      case "arrived":
        headline =
          group.length > 1
            ? `${group.length} have arrived`
            : `${name} ${isSelf ? "have" : "has"} arrived`;
        break;
      default:
        headline =
          group.length > 1
            ? `${group.length} ${plural(group.length)} ahead`
            : hasDistances
            ? `${name} ${isSelf ? "are" : "is"} ${gap.toFixed(1)} km ahead`
            : `${name} pulled ahead`;
    }

    return {
      tone: key === "stopped" ? "alarm" : key === "behind" ? "attention" : "info",
      eyebrow: EYEBROW[key],
      headline,
      metric,
      metricLabel,
      status: key,
      subjectId: subject.id,
    };
  }

  // Everybody located is travelling with the pack.
  const remaining = selfLocated
    ? selfStatus.kmLeft
    : median(located.map((p) => statuses[p.id].kmLeft));

  return {
    tone: "calm",
    eyebrow: "ALL GOOD",
    headline: "All together",
    metric: hasDistances ? remaining.toFixed(1) : null,
    metricLabel: hasDistances
      ? `KM TO ${(destinationName ?? "GO").toUpperCase()}`
      : null,
    status: "with",
    subjectId: null,
  };
}
