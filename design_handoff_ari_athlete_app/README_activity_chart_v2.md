# ARI — Activity Detail (run analysis screen) — standalone handoff

Open `ARI Activity Detail.dc.html` directly in a browser (keep `support.js` and `image-slot.js` next to it — prototype harness only, do not port).

Design tokens: the full :root variable block is at the top of the HTML file — every color/radius goes through it.

## Activity Detail v2 (intervals.icu-style)
Rebuilt per reference. Key spec for implementation:

### Header (one row, flex, wraps as two groups)
- Identity group (flex column): [photo 40px circle image-slot id="activity-athlete" + monogram overlay, run-type tag + "Monday, 17.08.26 · 7:00 PM"] and below it a centered distance box: "10.00 km · 49:00 min".
- Metric trio (side by side, flex:1 each, icon chips in band color): PACE (Pace, GAP, Speed km/h, Climb m), HEART RATE (Avg HR %, Max HR %), TRAINING (Cadence spm, Drift %, Load, Calories).
- Drag-selection on the chart recomputes ALL header metrics for the selected range; "Selection · ..." note appears; single click clears.

### Chart card
- Segment strip: per-km columns aligned to the plot area (padding-inline-start 5.42% / end 2.54% = plot gutter 64/1180..1150/1180). Each column: pace (bold), duration, avg bpm, zone+% of max HR. Fastest km highlighted (accent bg + top edge).
- ONE svg viewBox 0 0 1180 372, FIVE stacked bands sharing the X axis (distance), each 65px with its own Y scale, contiguous boundaries at y=8,73,138,203,268,332, alternating subtle band backgrounds:
  1. Pace/km (green #6fcf87, inverted — faster up, area fill, planned-pace band 5:30±10s shaded + dashed line)
  2. Power (yellow #e3b84e, area fill, W)
  3. Heartrate (red #e0566b, area fill, 93-184 bpm)
  4. Cadence (blue #5a9bf5, 158-192 spm)
  5. Altitude (gray --color-atl fill)
- Vertical gridlines every 0.5 km across all bands; dual X axis below: km row + elapsed-time row (time ticks every 5 min mapped through distance).
- IMPORTANT ENGINEERING NOTE: dynamic text inside SVG does not render in the DC runtime — ALL labels (band titles, per-band 3-tick Y values with mid tick in band color, km/time rows, FASTEST KM / DRIFT ONSET marker labels, crosshair value chips) are an absolutely-positioned HTML overlay on top of the svg, positions as % of viewBox (left=x/1180, top=y/372). In React/Next this constraint disappears — native <text> is fine.
- Hover: full crosshair (vertical + horizontal gray line), dots on every series, tooltip (km/time, pace, power, HR, cadence, elev), live Y-value chip in the hovered band's units + X-value km chip on the axis.
- Markers: green shaded rect over fastest km, dashed amber DRIFT ONSET line at ~6.5 km.
- Hint line below chart: "Pace is inverted — faster is up · hover for detail · drag to select a range".
- Demo data: 295 samples @10s, progressive 10.00 km (5:55→4:12), HR lags pace and caps ~181 with noise, power derived from speed+grade, per-km splits computed from the stream.

