/**
 * A repair point: somewhere a cyclist can get moving again.
 *
 * One entry type with a category rather than separate "shops" and "points".
 * A shop and a guy with a floor pump differ by an enum value, not by shape —
 * splitting them would mean two forms, two tables and two of everything to
 * express one attribute.
 *
 * Deliberately absent: any author. Points are contributed by a device with no
 * account, so there is no identity to display and no reputation to build on.
 * Confirmations are the only trust signal there is.
 */

export type RepairCategory = "shop" | "mechanic" | "pump" | "tube" | "water";

/** Display order everywhere: filter chips, the add form, the map legend. */
export const REPAIR_CATEGORIES: readonly RepairCategory[] = [
  "shop",
  "mechanic",
  "pump",
  "tube",
  "water",
] as const;

export interface RepairPoint {
  id: string;
  /** 1–60 chars after trim. What the row reads as. */
  name: string;
  category: RepairCategory;
  lat: number;
  lng: number;
  /** Free text, ≤140. Opening hours, landmarks, what they will and won't do. */
  note: string | null;
  /**
   * A third party's phone number, submitted by a stranger. Optional for a
   * reason — this is the one field on the entry that publishes personal data
   * about someone who never agreed to be listed.
   */
  phone: string | null;
  addedAt: number;
  /** Last time anyone tapped "still here". Null means nobody ever has. */
  confirmedAt: number | null;
  confirmations: number;
}
