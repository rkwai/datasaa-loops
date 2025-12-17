# OLO Local-First Frontend

A single-page React + TypeScript application that keeps marketing data entirely in the browser (IndexedDB). Users spin up isolated projects, import CSVs, derive LTV/CAC metrics, explore segments, draft spend plans, and export bundles—no server involved.

## Getting started

```bash
cd olo-frontend
npm install
npm run dev       # launches Vite dev server
npm run build     # type-check + production bundle (requires Node 20.19+ or 22.12+)
```

There are no automated tests yet; regression checks are done manually through the UI.

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
| Segment Dashboard | KPI tiles, segment & channel tables with resettable filters, customer/channel drilldowns, recompute button. |
| CAC Attribution Map | SVG beams connecting channels→segments with color legend and selection card. |
| Spend Plan | Auto-generated recommendations, editable table, approval + CSV/JSON export, plan history. |
| Settings | LTV window, churn events, segment quantiles, CAC source, attribution mode, locale, and “clear local data”. |
| Audit Log | Filter chips and table for the latest 200 audit entries. |
| Export | Buttons for project bundle ZIP + metrics CSV downloads. |

## Spec flows status

| # | Flow | Status | Notes/tests |
| --- | --- | --- | --- |
| 1 | First run → create project | **Implemented** | Manual verification via Project Home; no automated tests. |
| 2 | Import customers | **Implemented** | Import Wizard + worker validation + audit logging; manual testing only. |
| 3 | Import transactions (recompute) | **Implemented** | Transactions import triggers compute worker; manual testing only. |
| 4 | Import channels + spend | **Implemented** | Supports channels + `channelSpendDaily`; manual testing only. |
| 5 | Acquisition links | **Implemented** | Settings toggle between `channelSourceId` and `acquiredVia`; manual testing only. |
| 6 | Segment dashboard drilldowns | **Implemented** | Segment/channel filters + detail tables working; manual testing only. |
| 7 | Spend reallocation plan | **Implemented** | Recommendation seed, approval, CSV/JSON exports, audit entries; manual testing only. |
| 8 | Export/import project | **Implemented** | JSZip manifest + JSONL bundle + hydrate-from-zip; manual testing only. |
| 9 | Crash recovery for jobs | **Planned** | Jobs table stores progress, but resume/rollback UI not built. |
|10 | Multi-tab behavior | **Implemented** | Web Locks + BroadcastChannel enforce single-writer; manual testing only. |

A flow will only be labeled “Tested” once we add automated coverage (e.g., Playwright or vitest). Until then, everything above is exercised manually.

## Export/backups

- **Project bundle**: `manifest.json` + JSONL files per store, zipped for portability. Use the Export screen to download; import wizard rehydrates to a new project.
- **Action plans**: CSV schema matches `plan_id, created_at, objective, channel_id, current_spend, proposed_spend, delta, rationale, model_version`. JSON exports include the full nested payload.
- **Metrics CSVs**: Customer/channel/segment materializations download individually from the Export screen.

## Limitations

- No automated crash recovery UI yet (jobs table is informational only).
- No encryption on export bundles—protect files manually.
- Spend recommendations are simple rule-based adjustments (top/bottom channels by HIGH-share vs CAC).
- No automated tests; regressions are caught by manual smoke tests after `npm run dev` or `npm run build`.
