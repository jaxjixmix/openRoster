---
target: schedule screen (web/src/app/(app)/schedule/page.tsx)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/Users/mojics/apps/openRoster/web/src/app/(app)/schedule/page.tsx"
target_fingerprint: "sha256:a982f62d3c0b8ffd67f1883438955859b6da7ae9d29194c177f720122216c5cd"
target_path: /Users/mojics/apps/openRoster/web/src/app/(app)/schedule/page.tsx
timestamp: 2026-11-04T04-10-29Z
slug: web-src-app-app-schedule-page-tsx
---
# Schedule screen critique

Method: dual-agent (A: 9847edc5 · B: 9c2a7d44)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Header rollup, per-day totals, badges, budget bar — excellent. Gap: silent week paging (no refetch indicator). |
| 2 | Match System / Real World | 2 | "Teams" legend says departments; card rails encode a position-name hash — measured collision: Prep Cook and Line Cook both render Bar-purple, Kitchen shifts render purple. Legend teaches a lie. |
| 3 | User Control and Freedom | 3 | Esc, paging, copy/paste/repeat all good. Missing: no undo on delete, no URL state (Back exits, no shareable week link). |
| 4 | Consistency and Standards | 3 | Tokens honored rigorously. Violations: hardcoded strings beside t(), double spinner on Auto-fill, native title tooltips. |
| 5 | Error Prevention | 2 | One-click Publish/Auto-fill bulk actions with no preview or expected-count confirm. |
| 6 | Recognition Rather Than Recall | 2 | Core verbs (add to busy day, copy) live in a right-click menu whose hint hides below 1280px; desktop cards have no visible trigger; legend misinformation compounds it. |
| 7 | Flexibility and Efficiency | 3 | Strong range presets, context menu parity, templates, export. Missing drag-to-edit; no URL state. |
| 8 | Aesthetic and Minimalist Design | 3 | Real palette point of view, disciplined surfaces. Drains: 8–9px micro-type, rows of identical dashed tiles, month cells type the weekday twice. |
| 9 | Error Recovery | 2 | window.confirm for delete; Publish partial failure (Promise.all) surfaces one error while some shifts already published. |
| 10 | Help and Documentation | 2 | One floating hint that vanishes on most laptops; nothing teaches paste/repeat. |
| **Total** | | **26/40** | Acceptable band — significant improvements needed |

## Design Specificity Verdict

**LLM assessment:** "Authored chrome, interchangeable clay" (7/10 authored). Paper/terracotta/mono-tabular shell is unmistakably OpenRoster; the board layer — the thing stared at 10× a day — defaults: decorative hash-of-string colors, 8–9px wireframe type, default-position verbs.

**Deterministic scan:** exactly 1 rule fired — `side-tab` accent rail, warning (`page.tsx:511`, `borderLeft: 3px solid`). Detector-blind siblings Assessment B quantified: timeline blocks use Tailwind `border-l-[3px]` (:872–881), mobile `ShiftRow` uses a 4px `w-1` bar — same language, undetected. Browser census: **100% of week-board cards (44/44) carry ≥3px left rails; 188 elements render under 10px type (min 7px); `muted/70` hours text measures 2.85:1 contrast (AA needs 4.5); timeline labels center vertically, a 7am shift's label sits at ~11am; mobile week page is 4,219px, month 5,669px, with ~200px of stacked controls before the first shift and a 28px kebab target.** False positives: none material; the last-rail language is genuinely the page's dominant visual system, so it is a fair hit.

Overlays were not injected into a user-visible tab (Playwright evidence pass succeeded; live-server overlay flow skipped by design — a user-visible overlay therefore does not exist).

## Overall Impression

A manager's whole day lives on this screen and it reads beautifully but writes poorly: you can scan coverage and cost instantly, then must recall hidden menus to act, while the one-click irreversible actions (Publish, Auto-fill) sit unguarded at the top. Biggest single opportunity: make the **color = truth** and give the routine verbs visible handles while demoting the risky bulk verbs behind a confirm.

## What's Working

1. **Ops-grade status in the chrome** — header rollup + per-day hours/open + badges + budget bar answer "am I covered, am I on budget?" with zero clicks.
2. **A signed visual identity** — terracotta-on-paper with tabular mono numerals down to day cells; genuinely restrained.
3. **Draft-first bulk choreography** — copy/paste/repeat/templates/auto-fill all land as reviewable drafts before Publish. Behaviorally correct for real schedulers.

## Priority Issues

**[P0] Micro-type floor** — timestamps/hours at 8–9px, names at 10px; `muted/70` = 2.85:1. 188 sub-10px elements. The product's core data is at the edge of legibility. Fix: floor time/name/hours at 11px full-strength `text-muted`, 12px semibold position names; recover density from padding, not type. → `/impeccable typeset` + `/impeccable harden`

**[P1] The legend lies (color ≠ meaning)** — rails encode hash-of-position-name; the Teams legend claims departments; two positions collide into one color. Fix key rails to `department.color` (the fallback path already does this); keep open-shift signaled by badge, not a competing color. → `/impeccable colorize`

**[P1] Timeline labels don't sit at their start time** — block content is vertically centered; a 7am shift's time renders near 11am; blocks under 40px width collapse to slivers (42 of 47). Fix: anchor content to the top of the block, merge truncated content tiers. → `/impeccable layout`

**[P1] Bulk verbs exposed, routine verb buried** — Publish/Auto-fill are one-click bulk actions with no preview; adding to a busy day has no visible affordance and its hint gets hidden below 1280px. Fix: Publish confirm-with-count; Auto-fill confirm modal with expected counts; add persistent visible affordance (hover/focus "+" and a kebab on desktop cards); keep the hint visible until first menu use. → `/impeccable onboard` + `/impeccable harden`

**[P2] Keyboard/SR orphaned menu & stateless view** — menu opens without focus move/announcement/arrows; view control isn't a tablist; location select unlabeled; no URL state for view/week. Fix: focus-first + arrow navigation + restore, tablist semantics, aria-label, `?view=&week=` sync. → `/impeccable harden`

## Persona Red Flags

**Alex (power user):** no drag-to-reschedule (modal-per-shift × 47/week); one global `busy` flag blocks every button; "This week" persists as label in 4-weeks view; `openDay()` force-switches to timeline; no bookmarkable week URL.

**Sam (keyboard/screen reader):** menu opens silently — no aria-expanded, no focus move, no arrows; view switcher not a tablist; location select unlabeled ("All locations" is its only name); disabled Publish gives no reason.

**Casey (mobile thumb):** ~200px of stacked controls before the first shift; 28px kebab and 20px modal-X tap targets (44px minimum); no sticky day headers across 4,200px of week and 5,669px of month; month/2w/4w silently degrade to one huge day list.

## Minor Observations

- Auto-fill renders two spinners when busy (own conditional + Button loading).
- `periodLabel` hardcodes "today" for Day view even when paging.
- `UploadCloud` icon for Publish (upload ≠ publish semantics).
- `window.confirm` delete goes to OS-grey; consider Undo toast pattern.
- Employee (non-manager) sees an inert focusable "+ Add" on the timeline.
- Month cell: weekday name twice; "0.0h covered" on empty days is semantically inverted.
- 135 `[data-shift-id]` nodes in DOM at week/board vs 44 visible (mobile duplicates in same document — acceptable, but worth a lazy-merge one day).

## Questions to Consider

- If the rail color could encode only one truth, which matters at 7pm on the line — taxonomy or uncovered/open pressure?
- Is Schedule a document managers publish, or an instrument they play? Right now the edit verbs are hidden and the bulk verbs are exposed — the inverse of an instrument.
