"use client";

import { useState } from "react";
import {
  AlertTriangle, ArrowLeft, Check, Crosshair, Droplet, Flag, Gauge,
  LifeBuoy, MapPin, Navigation, Phone, Plus, Store, Wrench, X,
} from "lucide-react";
import {
  C, FONT, Eyebrow, Field, IconButton, PrimaryButton, SecondaryButton, PAD_T, PAD_B,
} from "./Radar";
import { TAB_BAR_SPACE } from "./TabBar";
import { RepairMap } from "./RepairMap";
import { formatDistance, type AtlasVerdict, type RankedPoint } from "@/lib/repairs/atlas";
import { REPAIR_CATEGORIES, type RepairCategory } from "@/lib/repairs/types";

/**
 * The repair atlas and its add flow.
 *
 * Mirrors `Radar.tsx` in construction: a category table at the top that owns
 * every per-category decision in one place, small primitives, then screens.
 *
 * The category is carried by an **icon plus a word**, never by colour alone —
 * the same rule the status glyphs follow, and for the same reason. Five
 * categories tinted five ways on one flat ground would collide in greyscale
 * and for colourblind riders.
 */

export const CATEGORY: Record<
  RepairCategory,
  { label: string; icon: typeof Wrench; hint: string; placeholder: string }
> = {
  shop:     { label: "Shop",     icon: Store,    hint: "Sells parts, does full repairs",     placeholder: "e.g. Osu Bike Clinic" },
  mechanic: { label: "Mechanic", icon: Wrench,   hint: "A person who fixes bikes",            placeholder: "e.g. Kwame at the overpass" },
  pump:     { label: "Pump",     icon: Gauge,    hint: "Air, and nothing else",               placeholder: "e.g. Shell Osu air line" },
  tube:     { label: "Tube & patch", icon: LifeBuoy, hint: "Punctures, tubes, tyres",         placeholder: "e.g. Circle Tyre & Tube" },
  water:    { label: "Water",    icon: Droplet,  hint: "A tap you can fill a bottle at",      placeholder: "e.g. Legon sports tap" },
};

/** The tone a staleness caveat is spoken in. Never the only channel. */
const caveatTone = (rp: RankedPoint) =>
  rp.trust.freshness === "stale" || rp.trust.unconfirmed ? C.stopped : C.muted;

// ─── Small primitives ───────────────────────────────────────────────────────

const CategoryMark = ({
  category, size = 40, dim = false,
}: { category: RepairCategory; size?: number; dim?: boolean }) => {
  const Icon = CATEGORY[category].icon;
  return (
    <div
      className="grid place-items-center shrink-0"
      style={{
        width: size, height: size, borderRadius: 999,
        background: dim ? C.sunken : C.text,
        color: dim ? C.muted : C.ground,
        border: dim ? `1.5px dashed ${C.lineStrong}` : "none",
      }}
    >
      <Icon size={Math.round(size * 0.45)} strokeWidth={2} />
    </div>
  );
};

const Chip = ({
  on, onClick, children,
}: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    aria-pressed={on}
    className="flex items-center gap-1.5 rounded-full shrink-0 transition-transform active:scale-[0.96]"
    style={{
      minHeight: 36, padding: "0 13px",
      background: on ? C.text : "transparent",
      color: on ? C.ground : C.muted,
      border: `1.5px solid ${on ? C.text : C.line}`,
      fontFamily: FONT.body, fontSize: 14, fontWeight: on ? 600 : 500,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </button>
);

const FilterRow = ({
  value, onChange,
}: { value: RepairCategory | "all"; onChange: (v: RepairCategory | "all") => void }) => (
  <div className="flex gap-2 overflow-x-auto no-scrollbar" style={{ paddingBottom: 2 }}>
    <Chip on={value === "all"} onClick={() => onChange("all")}>
      All
    </Chip>
    {REPAIR_CATEGORIES.map((c) => {
      const Icon = CATEGORY[c].icon;
      return (
        <Chip key={c} on={value === c} onClick={() => onChange(c)}>
          <Icon size={14} />
          {CATEGORY[c].label}
        </Chip>
      );
    })}
  </div>
);

/** One row in the list. Two lines: what it is, and whether to believe it. */
const PointRow = ({ rp, onOpen }: { rp: RankedPoint; onOpen: () => void }) => {
  const dim = rp.trust.freshness === "stale" || rp.trust.unconfirmed;
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 text-left transition-transform active:scale-[0.99]"
      style={{ minHeight: 64, paddingTop: 8, paddingBottom: 8 }}
    >
      <CategoryMark category={rp.point.category} dim={dim} />
      <div className="flex-1 min-w-0">
        <div
          className="truncate"
          style={{ fontFamily: FONT.body, fontSize: 15, fontWeight: 600, color: C.text }}
        >
          {rp.point.name}
        </div>
        <div
          className="truncate"
          style={{ fontFamily: FONT.body, fontSize: 13, color: caveatTone(rp), marginTop: 2 }}
        >
          {rp.trust.label}
        </div>
      </div>
      {rp.meters !== null && (
        <span
          className="tnum shrink-0"
          style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: 600, color: C.muted }}
        >
          {formatDistance(rp.meters)}
        </span>
      )}
    </button>
  );
};

// ─── Screen: the atlas ──────────────────────────────────────────────────────

export const Atlas = ({
  ranked, verdict, here, category, onCategory, onAdd, onOpen, selectedId,
}: {
  ranked: RankedPoint[];
  verdict: AtlasVerdict;
  here: { lat: number; lng: number } | null;
  category: RepairCategory | "all";
  onCategory: (v: RepairCategory | "all") => void;
  onAdd: () => void;
  onOpen: (id: string | null) => void;
  selectedId: string | null;
}) => (
  <div className="flex flex-col h-full" style={{ paddingTop: PAD_T }}>
    <div className="flex items-center justify-between gap-3 px-6" style={{ paddingBottom: 4 }}>
      <div className="flex items-center gap-2">
        <Wrench size={17} style={{ color: C.text }} />
        <span
          style={{
            fontFamily: FONT.display, fontWeight: 600, letterSpacing: "-0.02em",
            color: C.text, fontSize: 16,
          }}
        >
          Repairs
        </span>
        {/* Says out loud that this is invented data, exactly as the admin
            portal's fixtures badge does. */}
        <span
          style={{
            fontFamily: FONT.mono, fontSize: 12, letterSpacing: "0.08em",
            color: C.muted, border: `1px solid ${C.line}`, borderRadius: 999,
            padding: "1px 8px",
          }}
        >
          PROTOTYPE
        </span>
      </div>
      <IconButton onClick={onAdd} label="Add a repair point" tone={C.text}>
        <Plus size={22} />
      </IconButton>
    </div>

    <div
      className="flex-1 min-h-0 overflow-y-auto px-6 no-scrollbar"
      style={{ paddingBottom: TAB_BAR_SPACE }}
    >
      {/* The verdict. One sentence and one number, in the largest type on the
          screen, because a rider standing over a dead bike reads one field. */}
      <div style={{ paddingTop: 10 }}>
        <Eyebrow>{verdict.eyebrow}</Eyebrow>
        <h2
          style={{
            fontFamily: FONT.display, fontSize: 28, lineHeight: 1.05,
            letterSpacing: "-0.03em", color: C.text, fontWeight: 500, marginTop: 4,
          }}
        >
          {verdict.headline}
        </h2>
        {verdict.metric && (
          <div className="flex items-baseline gap-2" style={{ marginTop: 4 }}>
            <span
              className="tnum"
              style={{ fontFamily: FONT.display, fontSize: 30, fontWeight: 700, color: C.text, lineHeight: 1 }}
            >
              {verdict.metric}
            </span>
            <span
              className="truncate"
              style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted, letterSpacing: "0.08em" }}
            >
              {verdict.metricLabel}
            </span>
          </div>
        )}
        {verdict.caveat && (
          <div
            className="flex items-start gap-1.5"
            style={{ fontFamily: FONT.body, fontSize: 13, color: C.stopped, marginTop: 8 }}
          >
            <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
            {verdict.caveat}
          </div>
        )}
      </div>

      <div style={{ paddingTop: 18 }}>
        <FilterRow value={category} onChange={onCategory} />
      </div>

      {ranked.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ height: 210, border: `1px solid ${C.line}`, marginTop: 16 }}
        >
          <RepairMap
            ranked={ranked}
            here={here}
            selectedId={selectedId}
            onSelect={onOpen}
            className="h-full"
          />
        </div>
      )}

      <div style={{ paddingTop: 10 }}>
        {ranked.map((rp) => (
          <PointRow key={rp.point.id} rp={rp} onOpen={() => onOpen(rp.point.id)} />
        ))}
      </div>

      {ranked.length === 0 && (
        <div style={{ paddingTop: 28 }}>
          <PrimaryButton onClick={onAdd}>
            Add the first one
            <Plus size={20} />
          </PrimaryButton>
        </div>
      )}

      {ranked.length > 0 && (
        <div style={{ paddingTop: 18 }}>
          <SecondaryButton onClick={onAdd}>
            Add a repair point
            <Plus size={20} />
          </SecondaryButton>
        </div>
      )}
    </div>
  </div>
);

// ─── Screen: one point ──────────────────────────────────────────────────────

export const PointSheet = ({
  rp, onClose, onConfirm, onReport, confirmed,
}: {
  rp: RankedPoint;
  onClose: () => void;
  onConfirm: () => void;
  onReport: () => void;
  /** True once this session has confirmed it — the button must not re-arm. */
  confirmed: boolean;
}) => {
  const { point, trust } = rp;
  const Icon = CATEGORY[point.category].icon;

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: C.scrim }}
      />
      <div
        className="relative rounded-t-[28px]"
        style={{
          background: C.ground,
          borderTop: `1px solid ${C.line}`,
          paddingBottom: PAD_B,
          maxHeight: "86%",
          overflowY: "auto",
        }}
      >
        <div className="flex items-start justify-between gap-3 px-6" style={{ paddingTop: 18 }}>
          <div className="flex items-center gap-3 min-w-0">
            <CategoryMark
              category={point.category}
              dim={trust.freshness === "stale" || trust.unconfirmed}
            />
            <div className="min-w-0">
              <Eyebrow>{CATEGORY[point.category].label.toUpperCase()}</Eyebrow>
              <h2
                style={{
                  fontFamily: FONT.display, fontSize: 22, fontWeight: 500,
                  letterSpacing: "-0.02em", color: C.text, marginTop: 2,
                }}
              >
                {point.name}
              </h2>
            </div>
          </div>
          <IconButton onClick={onClose} label="Close" tone={C.muted} size={40}>
            <X size={20} />
          </IconButton>
        </div>

        <div className="px-6" style={{ paddingTop: 14 }}>
          <div
            className="flex items-center gap-2"
            style={{ fontFamily: FONT.body, fontSize: 14, color: caveatTone(rp) }}
          >
            {trust.freshness === "stale" || trust.unconfirmed ? (
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            ) : (
              <Check size={15} style={{ flexShrink: 0 }} />
            )}
            {trust.label}
            {point.confirmations > 0 && (
              <span style={{ color: C.muted }}>
                · {point.confirmations} {point.confirmations === 1 ? "rider" : "riders"}
              </span>
            )}
          </div>

          {rp.meters !== null && (
            <div
              className="tnum"
              style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted, marginTop: 6 }}
            >
              {formatDistance(rp.meters)} from you
            </div>
          )}

          {point.note && (
            <p
              style={{
                fontFamily: FONT.body, fontSize: 15, lineHeight: 1.55, color: C.text,
                marginTop: 16,
              }}
            >
              {point.note}
            </p>
          )}

          <div className="flex flex-col gap-3" style={{ paddingTop: 22 }}>
            {/* `arrived` rather than `withg` for the settled state: it is the
                app's success semantic, and ground-on-arrived is a pairing the
                map flag already proves rather than one invented here. */}
            <PrimaryButton
              onClick={onConfirm}
              disabled={confirmed}
              tone={confirmed ? C.arrived : undefined}
            >
              {confirmed ? "Thanks — marked as still here" : "Still here"}
              {confirmed ? <Check size={20} /> : <Icon size={20} />}
            </PrimaryButton>

            {point.phone && (
              <a href={`tel:${point.phone.replace(/\s/g, "")}`} className="block">
                <SecondaryButton>
                  Call {point.phone}
                  <Phone size={20} />
                </SecondaryButton>
              </a>
            )}

            <a
              href={`https://www.openstreetmap.org/directions?to=${point.lat}%2C${point.lng}`}
              target="_blank"
              rel="noreferrer"
              className="block"
            >
              <SecondaryButton>
                Directions
                <Navigation size={20} />
              </SecondaryButton>
            </a>
          </div>

          {/* The quiet third action. It never changes what any rider sees — it
              only raises a hand in the admin queue, so the never-auto-hide
              rule holds while you still get a signal about what is wrong. */}
          <button
            onClick={onReport}
            className="w-full flex items-center justify-center gap-2"
            style={{
              fontFamily: FONT.body, fontSize: 13, color: C.muted,
              minHeight: 44, marginTop: 8,
            }}
          >
            <Flag size={14} />
            Report a problem with this point
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Screen: adding one ─────────────────────────────────────────────────────

export interface DraftPoint {
  name: string;
  category: RepairCategory;
  note: string;
  phone: string;
  lat: number;
  lng: number;
}

export const AddPoint = ({
  here, onBack, onAdd,
}: {
  here: { lat: number; lng: number } | null;
  onBack: () => void;
  onAdd: (draft: DraftPoint) => void;
}) => {
  const [category, setCategory] = useState<RepairCategory>("mechanic");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(here);

  const ready = name.trim().length > 0 && pin !== null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4" style={{ paddingTop: PAD_T }}>
        <IconButton onClick={onBack} label="Back" tone={C.text}>
          <ArrowLeft size={22} />
        </IconButton>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 no-scrollbar">
        <h2
          style={{
            fontFamily: FONT.display, fontSize: 28, color: C.text, fontWeight: 500,
            letterSpacing: "-0.02em", marginTop: 8, marginBottom: 6,
          }}
        >
          Add a repair point
        </h2>
        <p style={{ fontFamily: FONT.body, color: C.muted, fontSize: 15, marginBottom: 22 }}>
          It appears for everyone straight away. Only add somewhere you have
          actually been.
        </p>

        <Eyebrow>WHAT IS IT</Eyebrow>
        <div className="flex gap-2 overflow-x-auto no-scrollbar" style={{ paddingTop: 10 }}>
          {REPAIR_CATEGORIES.map((c) => {
            const Icon = CATEGORY[c].icon;
            return (
              <Chip key={c} on={category === c} onClick={() => setCategory(c)}>
                <Icon size={14} />
                {CATEGORY[c].label}
              </Chip>
            );
          })}
        </div>
        <div style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted, marginTop: 8 }}>
          {CATEGORY[category].hint}
        </div>

        <div style={{ marginTop: 22 }}>
          <Field label="NAME">
            <MapPin size={20} style={{ color: C.muted }} />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={CATEGORY[category].placeholder}
              maxLength={60}
              className="flex-1 bg-transparent outline-none"
              style={{ color: C.text, fontFamily: FONT.body, fontSize: 16 }}
            />
          </Field>
        </div>

        <div style={{ marginTop: 20 }}>
          <Field label="WHAT SHOULD A RIDER KNOW">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Hours, landmarks, what they'll fix"
              maxLength={140}
              className="flex-1 bg-transparent outline-none"
              style={{ color: C.text, fontFamily: FONT.body, fontSize: 16 }}
            />
          </Field>
        </div>

        <div style={{ marginTop: 20 }}>
          <Field label="PHONE (OPTIONAL)">
            <Phone size={20} style={{ color: C.muted }} />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+233…"
              inputMode="tel"
              maxLength={20}
              className="flex-1 bg-transparent outline-none"
              style={{ color: C.text, fontFamily: FONT.body, fontSize: 16 }}
            />
          </Field>
          {/* The one field that publishes somebody else's personal data. It
              gets said plainly rather than buried in a policy nobody opens. */}
          <div
            className="flex items-start gap-2"
            style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 1.5 }}
          >
            <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
            Only add a number if they told you it can be shared. It becomes
            public to every rider using Radar.
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <Eyebrow>WHERE</Eyebrow>
          <div
            className="rounded-2xl overflow-hidden"
            style={{ height: 220, border: `1px solid ${C.line}`, marginTop: 10 }}
          >
            <RepairMap
              ranked={[]}
              here={pin}
              selectedId={null}
              onSelect={() => {}}
              className="h-full"
            />
          </div>
          <button
            onClick={() => setPin(here)}
            className="flex items-center gap-2 transition-transform active:scale-[0.97]"
            style={{
              fontFamily: FONT.body, fontSize: 14, minHeight: 44,
              color: pin ? C.arrived : C.muted, fontWeight: 500,
            }}
          >
            {pin ? <Check size={16} /> : <Crosshair size={16} />}
            {pin ? "Pinned where you are standing" : "Use my location"}
          </button>
        </div>
      </div>

      <div className="px-6" style={{ paddingTop: 12, paddingBottom: PAD_B }}>
        <PrimaryButton
          disabled={!ready}
          onClick={() =>
            pin &&
            onAdd({
              name: name.trim(),
              category,
              note: note.trim(),
              phone: phone.trim(),
              lat: pin.lat,
              lng: pin.lng,
            })
          }
        >
          {ready ? "Add point" : "Give it a name first"}
          <Plus size={20} />
        </PrimaryButton>
      </div>
    </div>
  );
};
