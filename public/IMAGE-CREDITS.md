# Photography

Both landing-page bands are Pexels stock, downloaded 2026-09-22. The Pexels
licence permits commercial use and does not require attribution; provenance is
recorded here anyway so the next person knows where they came from and can find
the originals.

| File | Source | Used for |
|---|---|---|
| `band-road.jpg` | pexels.com/photo/30316477 — Valdans Media | The crossing, between the night hero and the daylight body. Riders strung out unevenly down an open road, which is the situation the verdict engine exists to read. |
| `band-runners.jpg` | pexels.com/photo/29840328 — Stephen Leonardi | Runners, between the five statuses and the erasure beat. One runner ahead of a chase group, which is what `ahead` and `behind` mean. Requested server-side as a 2400x1100 crop (`&h=1100&fit=crop`) because the original is portrait and a CSS crop of it would have thrown away the horizontal resolution a full-bleed band needs. |
| `band-arrival.jpg` | pexels.com/photo/9786298 — Daniel Way | Arrival, above the closing call to action. |

Resized to 2000px wide and re-encoded at quality 68 with `sips`, which also
strips the originals' EXIF. `next/image` serves WebP/AVIF variants from these.
