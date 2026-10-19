# 2-minute demo script

Open the live demo (https://dash-boop0.github.io/aeo-geo-visibility-lab/) or run it locally (see README).

**0:00 — Framing (15 s).** "This is a research tool for AEO/GEO: you ask AI assistants a fixed set of buyer
questions, log what they say and cite, and measure brand visibility with sample sizes on every number. The data
you'll see is a fictional, synthetic sample — the banner says so on every page."

**0:15 — The sample (10 s).** The illustrative sample project opens automatically on first visit (or click **Load illustrative sample project**). Point at the orange banner:
fictional brands, synthetic observations, not real AI results.

**0:25 — Overview (30 s).**
- Tiles: target brand mention rate *38.0% (60 of 158)*, target-domain citation rate, mention share — each with
  its numerator/denominator.
- Hover a bar in **Brand mention rate** to show the tooltip.
- **Mention share by platform**: shares of all tracked-brand mentions per platform.
- **Target mention rate by date**: Assistant C has only one point — it was not observed on the first date, and
  the coverage table lists that gap as "missing" instead of 0%.
- Tick **Assistant B** in the filter: every number recalculates for 60 observations.

**0:55 — Compare (25 s).** Open **Compare**. Dates 2026-09-07 → 2026-10-05: per-platform table shows changes in
percentage points on *matched questions*, and "not comparable — No observations for 2026-09-07" for Assistant C.
Switch to **Two platforms** to compare Assistant A vs B.

**1:20 — Log an observation (20 s).** Open **Observations**, pick question q01 (prompt auto-fills), platform
"Assistant D", type a summary naming Ledgerly, click **Suggest from summary**, add a cited URL, **Add observation**.
Show an invalid URL being rejected with a clear message.

**1:40 — Export (15 s).** Open **Data**: download **Processed metrics (CSV)** (numerator, denominator, value,
low-n flag per group) and **Report (Markdown)**; mention the CSV templates and JSON backup/restore.

**1:55 — Close (5 s).** Open **Method**: metric definitions with denominators, and the limitations — answers vary
run to run, manual coding bias, small samples.
