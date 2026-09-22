"use client";

import { useEffect, useMemo, useState } from "react";
import { Atlas, AddPoint, PointSheet, type DraftPoint } from "../../../components/Repairs";
import { useHideTabBar } from "../../../components/TabBarContext";
import { rank, verdictFor } from "@/lib/repairs/atlas";
import { DEMO_POINTS, DEMO_POSITION } from "@/lib/repairs/fixtures";
import type { RepairCategory, RepairPoint } from "@/lib/repairs/types";

/**
 * The repair atlas — prototype.
 *
 * State lives in this component and nothing is persisted: there is no
 * endpoint, no `DataClient` method and no table yet, and inventing them before
 * the design is settled would be the expensive kind of guess. Adding a point
 * or confirming one mutates local state so the interaction can be judged; a
 * refresh puts it back.
 *
 * `now` is passed down rather than read inside the tree, the same way
 * `HomeDashboard` takes it, so every age label on one paint agrees with the
 * others instead of drifting mid-render.
 */

type Step = "atlas" | "add";

export default function Repairs() {
  const tabBar = useHideTabBar();
  const [points, setPoints] = useState<RepairPoint[]>(DEMO_POINTS);
  const [category, setCategory] = useState<RepairCategory | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("atlas");
  const [confirmedThisSession, setConfirmedThisSession] = useState<string[]>([]);
  const [reported, setReported] = useState<string[]>([]);

  // Real geolocation would go through `useGeolocation`; the prototype stands
  // you in Osu so the distances mean something on a desktop browser.
  const here = DEMO_POSITION;
  const now = Date.now();

  // The add flow owns the whole viewport — a long form with a bottom CTA — so
  // the shell's tab bar stands down for it, exactly as Create does.
  useEffect(() => {
    tabBar.setHidden(step === "add");
    return () => tabBar.setHidden(false);
  }, [step, tabBar]);

  const ranked = useMemo(
    () => rank(points, here, now, category),
    [points, here, now, category],
  );
  const verdict = useMemo(
    () => verdictFor(ranked, category, here !== null),
    [ranked, category, here],
  );

  const selected = ranked.find((r) => r.point.id === selectedId) ?? null;

  const handleConfirm = (id: string) => {
    setPoints((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, confirmedAt: now, confirmations: p.confirmations + 1 } : p,
      ),
    );
    setConfirmedThisSession((prev) => [...prev, id]);
  };

  const handleAdd = (draft: DraftPoint) => {
    const point: RepairPoint = {
      id: `rp-local-${Date.now()}`,
      name: draft.name,
      category: draft.category,
      lat: draft.lat,
      lng: draft.lng,
      note: draft.note || null,
      phone: draft.phone || null,
      addedAt: now,
      // Nobody has confirmed it, including the person who just added it —
      // which is precisely what the row will say.
      confirmedAt: null,
      confirmations: 0,
    };
    setPoints((prev) => [point, ...prev]);
    setStep("atlas");
    setSelectedId(point.id);
  };

  if (step === "add") {
    return <AddPoint here={here} onBack={() => setStep("atlas")} onAdd={handleAdd} />;
  }

  return (
    <>
      <Atlas
        ranked={ranked}
        verdict={verdict}
        here={here}
        category={category}
        onCategory={setCategory}
        onAdd={() => setStep("add")}
        onOpen={setSelectedId}
        selectedId={selectedId}
      />
      {selected && (
        <PointSheet
          rp={selected}
          confirmed={confirmedThisSession.includes(selected.point.id)}
          onClose={() => setSelectedId(null)}
          onConfirm={() => handleConfirm(selected.point.id)}
          onReport={() => {
            setReported((prev) => [...prev, selected.point.id]);
            setSelectedId(null);
          }}
        />
      )}
      {/* Prototype affordance: shows the report actually went somewhere. */}
      {reported.length > 0 && <ReportedToast count={reported.length} />}
    </>
  );
}

function ReportedToast({ count }: { count: number }) {
  return (
    <div
      className="absolute left-0 right-0 flex justify-center z-50"
      style={{ bottom: "calc(var(--safe-b) + 84px)" }}
      role="status"
    >
      <div
        style={{
          background: "var(--c-text)", color: "var(--c-ground)",
          fontFamily: "var(--font-body)", fontSize: 13,
          padding: "9px 16px", borderRadius: 999,
        }}
      >
        {count === 1 ? "Reported for review" : `${count} reported for review`}
      </div>
    </div>
  );
}
