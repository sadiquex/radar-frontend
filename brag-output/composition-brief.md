# Hyperframes Composition Brief: Radar

## Objective
Create a short launch-style brag video for **Radar**, a web app for temporary location sharing among groups moving together. The video must argue two things the product actually does and nobody else claims: it **reduces** a group to one sentence and one number, and then it **forgets** them.

## Output
- Composition directory: `frontend/brag-output/composition/`
- Rendered video: `frontend/brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 22.5s (6 scenes, as rendered)

## Source Material
- Project root: `/Users/ibrahim/Desktop/codes/personal/frontend-web/active-radar/frontend`
- Primary files read: `app/components/Radar.tsx` (the prop-driven screen library — `Landing`, `Share`, `VerdictBlock`, `Horizon`, `STATUS`, `Mark`, design tokens `C`/`FONT`), `lib/verdict.ts`, `lib/status.ts`, `lib/shareCode.ts`, `app/globals.css` (colour tokens), `app/layout.tsx` (fonts), `README.md`, `../PROJECT-OVERVIEW.md`
- Product name: **Radar**
- Tagline / strongest claim: *"Know where everyone is. Without the calls."* — plus the real architectural claim: there is no position-history table; coordinates are overwritten in place, never appended.
- Key UI to recreate: the **verdict block** (`VerdictBlock` in `Radar.tsx:473`), the **horizon strip** (`Horizon` at `Radar.tsx:399`), the **Share screen code card** (`Share` at `Radar.tsx:799`), and the **Radar mark** (`Mark` at `Radar.tsx:536`).
- Copy that must appear verbatim:
  - `A map full of pins answers nothing.` *(written for the video, from the product's own framing)*
  - `TRIP CODE · TAP TO COPY LINK` / `LINK COPIED` *(Share screen eyebrow)*
  - `Join in seconds. No app to install.` *(landing copy)*
  - `HEADS UP` *(verdict eyebrow for the `behind` status)*
  - `Ama is 1.4 km back` *(exactly the shape `computeVerdict` emits for one behind rider)*
  - `1.4` + `KM BEHIND THE GROUP` *(verdict metric + metricLabel)*
  - `START` / `AKOSOMBO` *(horizon end labels, mono, uppercase)*
  - `Behind` · `With group` · `Ahead` · `Arrived` *(the `STATUS[].label` values)*
  - `Then it forgets.`
  - `8 HOURS. THEN THE COORDINATES ARE GONE.`
  - `There is no position-history table to keep them in.`
  - `Radar` + `Know where everyone is. Without the calls.`

## Creative Direction
- Tone preset: **polished**
- Creative direction: *a field instrument, quietly demonstrated*
- Interpretation: restraint is the argument. Long settled holds, one idea per scene, type doing the work, no flashy transitions. Six beats instead of polished's usual three or four because the flow needs entry → action → result plus the privacy payoff — but each scene keeps polished's 3–4.5s length. The video should behave the way the app does: flat, legible in sunlight, one thing at a time, nothing decorative.
- Angle: A map shows you dots; Radar tells you what they mean, and then it forgets. Almost every location-sharing product brags "look, everyone on a map." Radar's thesis is the opposite — a rider at effort reads one field, not eight, so the whole group collapses into a verdict. And the privacy claim isn't marketing: coordinates are overwritten in place, never appended, and the purge sweep erases the rest at 8 hours. The video is reduction, then erasure.
- Hook: nine unreadable map pins scattered on the app's cream sunlight ground; one line lands and holds — *"A map full of pins answers nothing."* — while the pins collapse onto a single horizontal rule that becomes the horizon strip.
- Outro / punchline: the board empties, the ground turns to the app's real dark theme, and the last claim is *"Then it forgets."* — then the mark, the name, and the landing page's own headline.
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign — use the project's own tokens, type and components
  - **Do not draw an actual map.** The premise is that the map is the wrong answer; a tile map on screen would argue against the video.
  - Any real person's name, email, coordinate or URL. All riders and the destination are fictional stand-ins.

## Visual Identity
Taken verbatim from `app/globals.css`.

- Background (light, the default — the app is used outdoors where a dark ground loses to reflected sunlight): `#F5F3EE`
- Background (dark theme, Scene 5–6 only): `#0E1116`
- Raised surface: `#FFFFFF` (dark: `#1C2129`) · Sunken: `#E7E3DA` · Line: `#CFCAC0` · Line-strong: `#6E6A61`
- Text: `#15171B` (dark: `#ECEAE4`) · Muted: `#54595F` (dark: `#A8ADB6`)
- Status accents: arrived `#0B6B3A`, ahead `#1B4FA8`, behind `#9C4208`, stopped `#A11B1B`, with-group `#3E4752` (dark: arrived `#5BD18A`, ahead `#7FADFF`, behind `#F5904C`)
- Avatar palette: `#7D5F2A` `#2E7D6B` `#7B4B9E` `#7A5C10` `#2F5F9E` `#1F7A5C` `#A03D5C` `#8F4E14`, all with white ink
- Display font: **Archivo** (Google) — headlines and all numerals; use tabular figures for metrics
- Body font: **Signika** (Google) — drawn for signage; body lines
- Mono font: **DM Mono** (Google), weights 400/500 **only** — small uppercase tracked labels (~0.08em). Never ask it for a heavier weight; the browser synthesises a smeared faux-bold.
- Visual references from the project:
  - **Status glyphs** `››` ahead, `‹‹` behind, `∴` with group, `‖` stopped, `✓` arrived — rendered in a **monospace system stack** (`ui-monospace, "SF Mono", Menlo, Consolas, monospace`), not the webfont, exactly as `Radar.tsx:103` does. The glyph is the accessibility channel; colour only reinforces it.
  - **Horizon rule**: 2px, `linear-gradient(90deg, #CFCAC0, #54595F, #0B6B3A)`, with a ringed flag marker at the destination end.
  - **Code card**: white, 1.5px `#6E6A61` border, ~22px radius, mono eyebrow above a 0.1em-tracked display-scale code.
  - **The mark** (reduced form, from `Radar.tsx:536` / `app/icon.svg`): 64-unit viewBox — ring `cx32 cy32 r21`, no fill, stroke text colour at 45% opacity, 6 wide; you `cx32 cy32 r9.5` filled arrived-green; one contact `cx47.5 cy16.5 r7.5` filled ahead-blue.

## Storyboard
Use the storyboard in `frontend/brag-output/brag-plan.md` as the creative contract. Scene summary:

1. **A map full of pins** — 0.00→3.27s (3.27s) — nine pins scatter then collapse onto one rule; the line *"A map full of pins answers nothing."* holds ~2.4s.
2. **Join in seconds** — 3.27→6.56s (3.29s) — Share code card `K7RQ4M`, simulated tap-to-copy (eyebrow flips to `LINK COPIED`), member counter ticks 1→2→4, body line *"Join in seconds. No app to install."*
3. **The verdict** — 6.56→10.93s (4.37s) — **hero frame**: `HEADS UP` eyebrow, huge *"Ama is 1.4 km back"*, metric `1.4` + `KM BEHIND THE GROUP`, caption *"The whole group, in one sentence."*
4. **The horizon** — 10.93→15.29s (4.36s) — four riders land along the rule one by one with their glyphs (Ama `‹‹` 2.1, Yaw `∴` 1.2, Kofi `››` 0.6, Nana `✓` here), then the four labels fade up **together** at 13.64s and hold 1.65s.
5. **Then it forgets** — 15.29→19.66s (4.37s) — board dissolves, ground crossfades to dark; *"Then it forgets."*, then the mono line and the position-history line.
6. **Radar** — 19.66→22.50s (2.84s) — mark draws, wordmark, *"Know where everyone is. Without the calls."* holds 2.14s to the end.

**Readability floor (non-negotiable):** every text element gets its settled hold — short labels ~0.8s, sentences ~0.3s/word with a 1.2s minimum. Entrances stay fast (0.3–0.6s); the pace comes from motion and cuts, never from pulling copy before it can be read.

## Audio
- Audio role: **sparse professional accents over a low bed.** The music supports; it never drives.
- Audio arc: a quiet bed runs the full length with ~6 motion-matched accents on it, ducks hard into the dark erasure scene at 15.29s, and fades out under a silent logo hold — so the two loudest moments are the verdict landing and the silence after it.
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (109.96 BPM — the calmest bundled track; the reference recommends vol-12 for `polished`).
- Music treatment: start 0.00s, volume ~0.30, 0.4s fade-in; **duck to ~0.12 from 15.29s** for the erasure scene; fade out fully across the last ~1.2s.
- Music cue guidance: bundled preset, copied to `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`. **Strong-cue locks (3):** `10.93s` (verdict→horizon cut), `17.47s` (the mono schema line), `19.66s` (outro mark). **Beat grid for the sequential rider arrivals:** `11.46 / 12.02 / 12.55 / 13.11`. The four status *labels* must NOT be on that grid — they appear as one set at `13.64s` and hold, because 0.545s spacing outruns reading. Cues are hints; readability wins every conflict.
- Audio-reactive treatment: **subtle**. At most let the verdict metric and the horizon rule carry a barely-perceptible presence/glow lift on RMS or bass. No waveform bars, no equalizer, no pulsing, nothing that reads as a visualiser. If extraction is unavailable, note it and skip — do not block the render.
- Audio-coupled moments:
  - Scene 1, last pin meets the rule — one soft physical settle
  - Scene 2, tap-to-copy — one dry interface tick on the card's scale-down
  - Scene 2, counter 1→2→4 — three very light increments
  - Scene 3, headline landing — one restrained low impact (the single biggest cue in the video)
  - Scene 4, four rider arrivals — four **identical** light placements, one per avatar, on the beat grid; no escalation, nothing on the label set
  - Scene 5, crossfade to dark — one soft air-out
  - Scene 6, logo hold — **deliberately nothing**
- SFX selection guidance: staged candidates are already in `assets/sfx/` — `impact/impactSoft_medium_00{0,1,2,4}.ogg` (low HF risk, warm, for the verdict impact and the settle), `interface/click_00{2,3}.ogg` (low HF risk, for the simulated tap), `interface/drop_00{1,2}.ogg` (gentle placements for the rider arrivals), `interface/bong_001.ogg` (warm low-risk accent), `casino/chips-stack-{1,2,3}.ogg` (counter increments). Swap any of these if the implemented motion wants something else, and copy whatever you choose into `assets/sfx/`.
- SFX analysis guidance: `/Users/ibrahim/.claude/plugins/cache/brag/brag/0.3.0/skills/brag/assets/sfx/sfx-analysis.md`. This is a **polished** video with a repeated four-item sequence — use low HF-risk files throughout; avoid the `casino/card-*` family (mostly high HF risk) for the repeated rider placements.
- Volumes: music 0.30 (0.12 while ducked), SFX 0.55–0.70 (polished restraint — nothing at 0.85).
- Track allocation: music at `data-track-index="10"`, SFX from 11 upward; never share an index between overlapping clips.
- Exact SFX choice: Hyperframes decides filenames, timestamps and density **after** the visual animation exists.
- Restraint rule: **no whooshes on text, no riser into the outro, no stacked layers.** If a cue is doing anything other than confirming a movement the eye already saw, cut it. Silence under the final logo hold is correct.
- Audio files: already copied into `frontend/brag-output/composition/assets/` (music + cue JSON + candidate SFX).

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design spec, beats, audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), `hyperframes-cli` (lint/check/render). This is the `/brag` workflow: do **not** enter the `hyperframes` entry-point intent interview and do not route into its generic promo / launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show real UI, copy and visuals from the source project — Scenes 2, 3 and 4 are all recreations of shipped components.
- Keep all text readable in the final render; honour the reading-time floor above.
- Total duration 22.5s (inside the 15–25s band).
- Include the music bed and the SFX layer.
- Treat `/brag` audio notes as guidance, not a fixed cue sheet; choose SFX after the animation exists.
- Lock the 3 named strong cues within ±0.15s and mark them `// beat-locked`; snap the four rider arrivals to the named beat grid within ±0.10s and mark them `// beat-grid`. Use natural timing wherever a cue would hurt readability, and say so.
- Wire at least one visual element to per-frame audio data (subtle), or document why extraction was unavailable.
- Use only local relative asset paths from `composition/` — never absolute `/Users/...` paths.
- **Do not fetch the Google fonts at render time if it risks a flash or a miss** — prefer whatever local/embedded font strategy Hyperframes recommends for deterministic renders, falling back to a close system stack. The status glyphs must stay on the monospace system stack regardless.
- Run `hyperframes check` (bare command, **not** `npx` — this machine's default Node is 20 and a PATH shim selects Node ≥22) before render. It is brag's single gate.
