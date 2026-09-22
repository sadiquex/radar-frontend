# Brag Plan: Radar

## What is this app?
Radar is temporary location sharing for groups moving together — a cycling group, a convoy, a hiking party. You join from a link in seconds with no app to install, and instead of a map full of pins you get **one sentence and one number** telling you what the group's positions actually mean. Every trip expires in 8 hours and the location data is genuinely deleted.

## The angle
**A map shows you dots. Radar tells you what they mean — and then it forgets.**

Almost every location-sharing product's brag is "look, everyone on a map." Radar's actual thesis is the opposite: a rider at effort reads *one field, not eight*, so the whole group collapses into a verdict — `HEADS UP / Ama is 1.4 km back / 1.4 KM BEHIND THE GROUP`. And the privacy claim isn't marketing: there is no position-history table in the schema. Coordinates are overwritten in place, never appended, and the purge sweep erases the rest at 8 hours.

That's the video: **reduction, then erasure.** Two things nobody else claims, both true at the code level.

## Hook (first 2-3 seconds)
Nine map pins scatter across the app's cream sunlight ground, unreadable and useless. One line arrives and holds: **"A map full of pins answers nothing."** As it holds, the pins collapse down onto a single horizontal rule — which is Radar's horizon strip, and becomes the spine of the next four scenes.

The hook earns the watch by opening with the thing the viewer already has, and breaking it.

## Key moments (the middle)
- **The trip code.** The real Share screen card: `TRIP CODE · TAP TO COPY LINK` over a 44px tracked code in the ambiguity-free alphabet (no `0/O/1/I`). The member counter ticks 1 → 2 → 4 as people join off the link. Entry, in three seconds, with no install.
- **The verdict.** The product's whole idea at full scale, exactly as `VerdictBlock` renders it: mono eyebrow `HEADS UP`, a 34px display headline **"Ama is 1.4 km back"**, then the tone-coloured metric **1.4** beside `KM BEHIND THE GROUP`. This is the hero frame.
- **The horizon and the glyphs.** The gradient rule from `START` to `AKOSOMBO` with a flag at the end. Four riders land along it one by one, each carrying its status glyph — `‹‹` `∴` `››` `✓` — then the four labels fade up together and hold. The glyph is the channel and colour only reinforces it, because five statuses on one ground collide for colourblind users.

## Outro / punchline
The board dissolves, the ground turns to the app's real dark theme, and the video's last claim is the one no competitor makes: **"Then it forgets."** — followed by the schema truth in the app's own mono voice. Then the mark, the name, and the landing page's own headline.

## User flow worth showing
Entry → key action → result, all three from the working app:
1. **Entry** — a trip code appears on the Share screen; people join from the link and the member count climbs.
2. **Key action** — the group screen computes and leads with the verdict: one sentence, one number.
3. **Result** — the horizon places everyone between start and destination with a status each; then the trip expires and the location data is erased.

## Tone
- Preset: **polished**
- Creative direction: *a field instrument, quietly demonstrated* — the video should behave the way the app does: flat, legible in sunlight, one thing at a time, nothing decorative.
- Interpretation: restraint is the argument. Long settled holds, one idea per scene, no flashy transitions, type doing the work. Six beats rather than polished's usual three or four, because the flow needs entry → action → result *plus* the privacy payoff — but each scene keeps polished's 3-4.5s length and generous hold.

## Format: landscape — 1920x1080
## Duration: 22.5s (as rendered)

## Visual identity (from the project)
- Background: `#F5F3EE` (`--c-ground`, light — the default, because the app is used outdoors where a dark ground loses to reflected sunlight). Dark ground `#0E1116` reserved for Scene 5.
- Raised surface: `#FFFFFF` · Sunken: `#E7E3DA` · Line: `#CFCAC0` · Line-strong: `#6E6A61`
- Text: `#15171B` · Muted: `#54595F`
- Accents (the five statuses): arrived `#0B6B3A`, ahead `#1B4FA8`, behind `#9C4208`, stopped `#A11B1B`, with-group `#3E4752`
- Dark-theme equivalents for Scene 5: text `#ECEAE4`, muted `#A8ADB6`, arrived `#5BD18A`
- Display font: **Archivo** (squarish grotesque; carries headlines and all numerals, tabular figures)
- Body font: **Signika** (drawn for signage and wayfinding; reads at 13px in glare)
- Mono font: **DM Mono**, 400/500 only (small uppercase tracked labels — never bolder, or the browser synthesises a smeared faux-bold)
- Strongest visual element: the **verdict block** (eyebrow + giant headline + tone-coloured metric), backed by the **horizon strip** and the five status glyphs `✓ ∴ ›› ‹‹ ‖`.

## Fictional stand-ins (no real data on screen)
Rider names **Kofi, Ama, Yaw, Nana**; destination **AKOSOMBO**; trip code **K7RQ4M** (valid under `SHARE_CODE_ALPHABET`). No account names, no emails, no URLs, no real coordinates.

## Share copy (draft)
Built Radar: temporary location sharing for groups moving together. It doesn't give you a map full of pins — it gives you one sentence and one number. And in 8 hours the location data is genuinely gone, because there's no position-history table to keep it in.

## Audio direction
- Role: **sparse professional accents over a low bed.** The music supports; it never drives.
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` — 109.96 BPM, the calmest of the bundled set.
- Music treatment: start at 0.00s, sit low (roughly -18 to -20 dB under the accents), 0.4s fade-in, and **duck noticeably at 15.29s** for the erasure scene so the dark frame reads as a drop rather than more of the same. Full fade-out across the last ~1.2s.
- Music cue guidance: preset read from `assets/music/cues/…vol-12….music-cues.md`. Target strong cues **10.93s** (verdict → horizon), **17.47s** (the schema line), **19.66s** (outro mark). Sequential rider arrivals sit on the beat grid window **11.46 / 12.02 / 12.55 / 13.11**; their text labels do *not* — those fade up as a set at 13.64 and hold. Cues are hints: readability wins every conflict.
- Audio-reactive treatment: **subtle**. At most, let the verdict metric and the horizon rule carry a barely-perceptible presence lift on bass energy. No waveform bars, no pulsing, nothing that reads as a visualiser.
- SFX posture: **sparse, motion-matched.** Roughly five to seven cues in the whole video. Every one attached to something that visibly moves.
- Audio-coupled moments: pins collapsing onto the rule (one soft settle); tap-to-copy on the code card (one dry interface tick); member counter ticks (three very light increments); verdict headline landing (one restrained low impact); four rider arrivals along the horizon (four identical light placements, same sound each time); the dissolve to dark (one soft reverse/air out).
- Restraint rule: **no whooshes on text, no riser into the outro, no stacked layers.** If a cue is doing anything other than confirming a movement the eye already saw, cut it. Silence under the final logo hold is correct.

## Storyboard

### Scene 1 — A map full of pins — 0.00 → 3.27s (3.27s)
Cream ground `#F5F3EE`. Nine small map pins in the avatar palette drift in scattered across the frame, overlapping, deliberately unreadable — this is the thing the viewer already owns. At ~0.8s the single line lands and **holds for 2.4s**: **"A map full of pins answers nothing."** (Archivo, large, `#15171B`, tight tracking.) Under the held line, the nine pins fall and collapse onto one horizontal rule across the lower third — the rule is the horizon strip, and it stays on screen into Scene 2.
Sequential/interaction: yes — nine pins collapse onto the rule in a fast staggered fall (0.04s apart), finishing together.
Audio intent: quiet opening, one physical settle when the pins land. The music has barely started.
Audio-coupled idea: one soft settle/impact at the moment the last pin meets the rule.
Music: low bed, fading in from 0.00s.
Transition mood: clean → Scene 2

### Scene 2 — Join in seconds — 3.27 → 6.56s (3.29s)
The horizon rule slides up and off; the real Share screen card takes the frame. White raised card `#FFFFFF`, 1.5px `#6E6A61` border, rounded 2xl. Mono eyebrow `TRIP CODE · TAP TO COPY LINK`, then the code **K7RQ4M** at display scale with 0.1em tracking. Beneath it, one body line: **"Join in seconds. No app to install."** A member counter under the card ticks **1 → 2 → 4** as people arrive off the link. At the end the eyebrow flips to `LINK COPIED`.
Sequential/interaction: yes — simulate the tap-to-copy (card scales to 0.99 and back, eyebrow flips), then three counter increments.
Audio intent: the sound of something working. Small, dry, confident.
Audio-coupled idea: one interface tick on the tap; three lighter ticks on the counter increments.
Music: low bed, steady.
Transition mood: soft slide → Scene 3

### Scene 3 — The verdict — 6.56 → 10.93s (4.37s)
The hero frame, and the one the whole video exists for. Cream ground, everything else gone. Rendered exactly as `VerdictBlock` does it:
- Mono eyebrow `HEADS UP` in the behind tone `#9C4208`
- Display headline **"Ama is 1.4 km back"** at full scale, `#15171B` — lands hard at ~6.9s and **holds ~3.4s**
- Below it the metric **1.4** (Archivo 700, `#9C4208`, tabular) beside the mono label `KM BEHIND THE GROUP`
A small muted caption sits low in the frame and holds from ~8.7s: **"The whole group, in one sentence."**
Sequential/interaction: yes — eyebrow, then headline, then metric and label together; three arrivals, each snapping in fast and settling.
Audio intent: this is the claim. One restrained low impact under the headline, then let it sit.
Audio-coupled idea: a single dry impact on the headline landing; nothing on the metric.
Music: bed continues; strong cue at 10.93s carries the cut out.
Transition mood: clean cut on the 10.93s strong cue → Scene 4

### Scene 4 — The horizon — 10.93 → 15.29s (4.36s)
The horizon strip at full width: a 2px rule running `#CFCAC0 → #54595F → #0B6B3A`, mono `START` at the left, `AKOSOMBO` at the right, a ringed flag marker at the destination end. Four rider avatars land along the rule at their distances, each carrying its status glyph badge:
- **Ama** `‹‹` behind `#9C4208`, furthest left, labelled `2.1`
- **Yaw** `∴` with group `#3E4752`, labelled `1.2`
- **Kofi** `››` ahead `#1B4FA8`, labelled `0.6`
- **Nana** `✓` arrived `#0B6B3A`, at the flag, labelled `here`
Once all four are placed, the four status labels — **Behind · With group · Ahead · Arrived** — fade up together at 13.64s and **hold to the cut** (1.65s).
Sequential/interaction: yes — four avatars arrive one by one on the beat grid at 11.46 / 12.02 / 12.55 / 13.11, each with an identical light placement sound. The text labels are deliberately *not* on that grid: they appear as one set at 13.64 and hold, so every one of them is readable.
Audio intent: rhythm and accumulation — the group assembling. Same sound four times, no escalation.
Audio-coupled idea: four identical light placements, one per avatar; nothing on the label set.
Music: bed continues under the four beats.
Transition mood: soft crossfade, ground darkening → Scene 5

### Scene 5 — Then it forgets — 15.29 → 19.66s (4.37s)
The avatars fade off the rule one by one, the labels go, the rule itself thins to nothing, and the ground crossfades from cream to the app's real dark theme `#0E1116`. Music ducks here. Into the empty dark frame:
- **"Then it forgets."** (Archivo, large, `#ECEAE4`) at 15.84s, **holds to the end of the scene**
- At the 17.47s strong cue, beneath it in DM Mono 500, tracked, `#A8ADB6`: **`8 HOURS. THEN THE COORDINATES ARE GONE.`** — holds 2.2s
- A last muted body line at 18.2s, small: **"There is no position-history table to keep them in."**
Sequential/interaction: yes — the board empties in a staggered dissolve (riders out 0.12s apart, right to left), then three text arrivals with long holds.
Audio intent: the drop. Music pulls back, one soft air-out on the dissolve, then near-silence carrying the claim.
Audio-coupled idea: one reverse/air-out on the ground crossfade; nothing on the text.
Music: ducked hard from 15.29s, staying low.
Transition mood: slow crossfade (0.6s) → Scene 6

### Scene 6 — Radar — 19.66 → 22.50s (2.84s)
Dark ground. The Radar mark draws in at the 19.66s strong cue — the reduced form, one range ring in `#ECEAE4` at 45% opacity, you at the centre in arrived green `#5BD18A`, one contact on the ring in ahead blue `#7FADFF`. The wordmark **Radar** sets beside it in Archivo 600. At ~19.9s the landing page's own headline arrives beneath and **holds 2.14s to the end**: **"Know where everyone is. Without the calls."** Hold on the settled frame.
Sequential/interaction: yes — ring draws, centre and contact pop in, wordmark, then the line.
Audio intent: arrival and rest. No riser, no logo whoosh. The music resolves and fades out.
Audio-coupled idea: none — deliberately. Silence under the final hold is the choice.
Music: resolves, full fade-out across the last ~1.2s.
Transition mood: end.

**Music mood for this video:** calm, low, supportive — a 110 BPM bed that carries rhythm without ever asking for attention.
**Audio summary:** A quiet bed runs the whole length with about six motion-matched accents on it — one settle, one tap, three counter ticks, one verdict impact and four identical rider placements — then ducks hard into the dark erasure scene and fades out under a silent logo hold, so the two loudest moments in the video are the verdict landing and the silence after it.
