"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { geocode } from "@/lib/data";
import type { Place } from "@/lib/data/geocode";
import { createDebouncer, shouldSearch, DEBOUNCE_MS } from "@/lib/search";
import { C, FONT, Eyebrow } from "./Radar";

/**
 * Destination search.
 *
 * Choosing a suggestion sets the name and the coordinates together, which is
 * the whole point: before this the Create screen let you name one place and
 * pin another and recorded both without complaint.
 *
 * Everything here degrades to nothing. A search that fails, a rate limit, an
 * API that is asleep — all of them leave the screen exactly as it was, with a
 * text field and a map pin, because that path still works and is untouched.
 *
 * The input reproduces `Field`'s markup rather than using it. `Field` wraps its
 * contents in a <label>, and a <label> containing a listbox sends every click
 * on an option back to the input — so the label and the underline are
 * duplicated here deliberately, and must be kept in step with `Field`.
 */

export interface DestinationSearchProps {
  /** The text in the field. Owned by the parent, which submits it. */
  value: string;
  onChange: (next: string) => void;
  /** Called when a suggestion is chosen: set the name and the pin together. */
  onSelect: (place: Place) => void;
}

export function DestinationSearch({ value, onChange, onSelect }: DestinationSearchProps) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const debouncer = useMemo(() => createDebouncer(DEBOUNCE_MS), []);
  // Guards against a slow response for "acc" landing after a fast one for
  // "accra" and overwriting it.
  const seq = useRef(0);

  useEffect(() => () => debouncer.cancel(), [debouncer]);

  const search = (raw: string) => {
    if (!shouldSearch(raw)) {
      debouncer.cancel();
      setPlaces([]);
      setOpen(false);
      setBusy(false);
      return;
    }
    setBusy(true);
    debouncer.run(() => {
      const mine = ++seq.current;
      void geocode.search(raw.trim()).then((found) => {
        if (mine !== seq.current) return;
        setPlaces(found);
        setActive(-1);
        setOpen(true);
        setBusy(false);
      });
    });
  };

  const choose = (place: Place) => {
    onChange(place.label);
    onSelect(place);
    setOpen(false);
    setPlaces([]);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Escape is handled before the guard below: an open list showing "No
    // matches" has nothing to arrow through, and leaving it undismissable by
    // keyboard would be the one state you cannot get out of without a mouse.
    if (e.key === "Escape") {
      if (!open) return;
      e.preventDefault();
      setOpen(false);
      setActive(-1);
      return;
    }
    if (!open || places.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % places.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? places.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(places[active]!);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <Eyebrow>DESTINATION</Eyebrow>
      <div
        className="flex items-center gap-3"
        style={{ borderBottom: `1.5px solid ${C.lineStrong}`, paddingTop: 8, paddingBottom: 10 }}
      >
        <MapPin size={20} style={{ color: C.muted }} />
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            search(e.target.value);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder="Where to?"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className="flex-1 bg-transparent outline-none"
          /* 16px minimum: anything smaller and iOS Safari zooms on focus. */
          style={{ color: C.text, fontFamily: FONT.body, fontSize: 16 }}
        />
        {busy && <Loader2 size={16} className="animate-spin" style={{ color: C.muted }} />}
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="rounded-2xl overflow-y-auto"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 20,
            background: C.raised, border: `1px solid ${C.lineStrong}`,
            maxHeight: 260, listStyle: "none", margin: 0, padding: 4,
          }}
        >
          {places.length === 0 && (
            <li
              style={{ fontFamily: FONT.body, fontSize: 14, color: C.muted, padding: "12px 12px" }}
            >
              No matches
            </li>
          )}
          {places.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(p)}
              onMouseEnter={() => setActive(i)}
              className="rounded-xl"
              style={{
                padding: "10px 12px", minHeight: 44, cursor: "pointer",
                background: i === active ? C.ground : "transparent",
              }}
            >
              <div style={{ fontFamily: FONT.body, fontSize: 15, color: C.text }}>{p.label}</div>
              {p.detail !== null && (
                <div style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted, marginTop: 2 }}>
                  {p.detail}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
