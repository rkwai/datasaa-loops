# OLO Local-First Frontend

A single-page React + TypeScript application that keeps marketing data entirely in the browser (IndexedDB). Every screen is optimized to highlight the blended LTV:CAC ratio so growth teams can see whether their best segments continually justify customer acquisition costs.

## Getting started

```bash
cd olo-frontend
npm install
npm run dev        # launches Vite dev server
npm run build      # type-check + production bundle (requires Node 20.19+ or 22.12+)
npm run test       # vitest suite covering Dexie/worker logic
# one-time setup for e2e
npx playwright install chromium
npm run test:e2e   # Playwright user-flow coverage (needs ability to start a local dev server)
```

## Architecture snapshot

- **React 19 + React Router** for UI and routing.
- **Dexie** manages IndexedDB: `olo_meta_db` tracks projects; each project gets `olo_project_<id>` storing all entities.
- **Workers**: `import.worker.ts` handles CSV parsing + chunked writes, `compute.worker.ts` recalculates customer/channel/segment metrics.
- **Styling**: custom CSS mirroring the provided mockups (Spline Sans, gradient hero cards, pill buttons).
- **Exports**: Project backups (ZIP + JSONL files), metrics CSVs, and action plans (CSV/JSON) via JSZip + Blob APIs.
- **Safety**: Web Locks + BroadcastChannel keep only one tab in write mode; others render read-only banners. All user actions (imports, recomputes, approvals, exports, settings) hit the audit log.

## IndexedDB stores (per project)

| Store | Purpose |
| --- | --- |
| `customers`, `transactions`, `channels`, `events` | Raw datasets keyed by IDs with acquisition/timestamp indexes. |
| `acquiredVia`, `channelSpendDaily` | Explicit customer→channel edges and optional daily spend inputs. |
| `customerMetrics`, `channelMetrics`, `segmentMetrics` | Materialized outputs written by the compute worker. |
| `modelConfig` | Single `active` record with LTV window, segment quantiles, CAC mode, attribution mode, locale info. |
| `importMappings`, `jobs` | Saved column mappings and progress state for imports/recomputes. |
| `auditLog`, `actionPlans` | Governance + approval/export history. |

## Major screens & flows

| Screen | Details |
| --- | --- |
| Project Home | Hero copy, create/import cards, card grid of existing projects with Open/Export/Delete. |
| Import Wizard | Checklist sidebar, dataset selector, column mapping, preview table, and job history feed. |
| Segment Dashboard | KPI tiles (incl. blended LTV:CAC), segment & channel tables with resettable filters, ratio badges, and drilldowns. |
| LTV→CAC Map | SVG beams connecting channels→segments with color legend and selection card that surfaces LTV:CAC. |
| Spend Plan | Auto-generated recommendations, editable table with channel ratios, approval + CSV/JSON export, plan history. |
| Settings | LTV window, churn events, segment quantiles, CAC source, attribution mode, locale, and “clear local data”. |
| Audit Log | Filter chips and table for the latest 200 audit entries. |
| Export | Buttons for project bundle ZIP + metrics CSV downloads. |

## Spec flows status

| # | Flow | Status | Notes/tests |
| --- | --- | --- | --- |
| 1 | First run → create project | **Tested (vitest + Playwright)** | `flows.spec.ts` (unit) + `tests-e2e/flows.spec.ts` (UI). |
| 2 | Import customers | **Tested (vitest + Playwright)** | Helper tests + UI walk-through. |
| 3 | Import transactions (recompute) | **Tested (vitest + Playwright)** | Compute pipeline unit test + UI confirmation. |
| 4 | Import channels + spend | **Tested (vitest + Playwright)** | Unit test ensures CAC math, e2e imports CSVs. |
| 5 | Acquisition links | **Tested (vitest)** | `acquired_via` unit test checks metrics. |
| 6 | Segment dashboard drilldowns | **Tested (vitest + Playwright)** | Unit test covers metrics; e2e verifies UI ratios. |
| 7 | Spend reallocation plan | **Tested (vitest + Playwright)** | Recommendation unit test + UI approval/export. |
| 8 | Export/import project | **Tested (vitest + Playwright)** | Bundle round-trip + UI export trigger. |
| 9 | Crash recovery for jobs | **Planned** | Jobs table stores progress, but resume/rollback UI not built. |
|10 | Multi-tab behavior | **Tested (vitest)** | `touchProject` test validates last-opened tracking for lock banner. |

## Export/backups

- **Project bundle**: `manifest.json` + JSONL files per store, zipped for portability. Use the Export screen to download; import wizard rehydrates to a new project.
- **Action plans**: CSV schema matches `plan_id, created_at, objective, channel_id, current_spend, proposed_spend, delta, rationale, model_version`. JSON exports include the full nested payload.
- **Metrics CSVs**: Customer/channel/segment materializations download individually from the Export screen.

## User flows

See `docs/user-flows.md` for the four supported journeys (data intake → compute, LTV↔CAC diagnosis, budget shift, and governance/export) that map directly to the screens described above and the `layout.html` mock-up.

## Limitations

- No crash-resume UI yet (jobs table is informational only).
- No encryption on export bundles—protect files manually.
- Spend recommendations are simple rule-based adjustments (top/bottom channels by HIGH-share vs CAC).
