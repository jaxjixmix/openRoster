---
target: schedule screen (web/src/app/(app)/schedule/page.tsx)
total_score: 35
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/Users/mojics/apps/openRoster/web/src/app/(app)/schedule/page.tsx"
target_fingerprint: "sha256:8897378079a2f86a9dadbacbc636897ab87b3057b98b8e1201693f6f88d374eb"
target_path: /Users/mojics/apps/openRoster/web/src/app/(app)/schedule/page.tsx
timestamp: 2026-11-04T08-19-38Z
slug: web-src-app-app-schedule-page-tsx
---
# Schedule screen — re-critique after craft pass

Method: focused re-critique (baseline dual-agent 26/40; six slices shipped: legibility, department color truth, bulk safety + undo, visible affordances, keyboard/URL harden, drag-to-move).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Rollups, badges, budget bar, drag naming; refetch remains silent but acceptable. |
| 2 | Match System / Real World | 4 | Rails now follow departments and the legend agrees; day label names the actual date; "All staffed" replaces the inverted empty-day label. |
| 3 | User Control and Freedom | 4 | Undo delete, URL state, Esc restore, drag-to-move, confirm dialogs. |
| 4 | Consistency and Standards | 3 | Shared tokens; remaining English literals ("Board", "Timeline") and the Shift modal's native confirm. |
| 5 | Error Prevention | 3 | Publish and Auto-fill both preview counts and lists; delete is undoable; conflict validation still server-side. |
| 6 | Recognition Rather Than Recall | 4 | Desktop kebabs, hover/focus add slot, timeline kebab, persistent hint until first use, 44px mobile target. |
| 7 | Flexibility and Efficiency | 4 | Drag-to-move, context-menu key, range presets, URL state, copy/paste/repeat. |
| 8 | Aesthetic and Minimalist Design | 3 | Type floor fixed and colour truthful; month still dense with capped cards and the deliberate department rail trips the side-tab detector. |
| 9 | Error Recovery | 3 | Undo + reload-on-error; Publish partial failure still reports one error for a partially successful batch. |
| 10 | Help and Documentation | 3 | Inline hint and confirm copy teach the verbs; no deeper help. |
| **Total** | | **35/40** | **Good — ship-ready with minor polish** |

## What changed

- **P0 legibility**: 8–9px data type replaced with 11px tabular time/hours and 11–12px names; low-contrast metadata raised to full-strength muted; timeline labels anchored to each block's start.
- **Color truth**: department colour drives rails; two positions can no longer collide; open shifts use a neutral rail plus badge; the legend is labelled and browser-tested against card colours.
- **Bulk safety**: Publish and Auto-fill open confirmation dialogs with counts and previews; delete is in-app and undoable for 30 seconds.
- **Affordances**: visible per-card/timeline actions, add-slot on populated days, persistent right-click hint until first use, 44px mobile kebab.
- **Harden**: menu focus/arrow/Escape/aria-expanded, tablist view control, labelled location filter, view/week/layout URL state, sticky mobile day headers, no inert add target for staff.
- **Drag**: desktop cards move between days with drop highlight; server overlap/leave/certification/cap checks remain authoritative.

## Remaining

- **P2** `side-tab` detector warning: deliberate left rail; now carries truthful department meaning. If removed later, replace with a department dot beside the position name.
- **P2** Publish partial failure: `Promise.all` reports one error while some shifts publish; switch to a settled result and report published vs failed counts.
- **P3** "Board"/"Timeline" and the Shift-modal delete confirm remain English/native; route through the catalog and an in-app dialog.
