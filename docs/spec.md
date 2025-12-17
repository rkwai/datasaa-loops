# OLO Local-First Web App (Implemented Spec)

This document captures the exact behavior that ships today. The app is a frontend-only React + TypeScript single page app that keeps all user data inside the browser (IndexedDB). It exposes a local-first workflow for importing marketing data, computing LTV/CAC metrics, emphasizing the LTV:CAC ratio at every decision point, exploring segments, drafting action plans, and exporting backups.

## 1. Architecture & Stack

- **UI**: React 19 + React Router + custom CSS inspired by the provided mockups.
- **State/Storage**: Dexie-powered IndexedDB. One meta database (`olo_meta_db`) lists projects; every project gets its own DB named `olo_project_<id>`.
- **Workers**: `import.worker.ts` parses CSVs with PapaParse, validates/massages rows, and writes chunked batches into IndexedDB. `compute.worker.ts` recomputes customer/channel/segment materializations.
- **Interop**: Project-level export/import bundles are produced with JSZip (manifest + JSONL per store). Metrics CSVs and action plans export directly from IndexedDB data.
- **Offline/Single tab guard**: Web Locks + BroadcastChannel ensure only one tab has write access; other tabs render a read-only banner.

## 2. Project & Data Model

### Meta database (`olo_meta_db`)
- `projects`: `{ id, name, currency, timezone, schemaVersion, createdAt, updatedAt, lastOpenedAt }`

### Per-project database (`olo_project_<id>`)
- **Core entities**: `customers`, `transactions`, `channels`, `events` with indexes on identifiers, acquisition dates, and customer joins.
- **Edges & spend**: `acquiredVia` (customer ↔ channel), `channelSpendDaily`.
- **Derived/materialized**: `customerMetrics`, `channelMetrics`, `segmentMetrics` (write-on-recompute only).
- **Config/governance**: `modelConfig` (single `active` row), `importMappings`, `auditLog`, `jobs`, `actionPlans`.

### Default model config
- LTV window: unlimited (can set days).
- Segments: HIGH 90th percentile, MID 70th percentile.
- CAC: uses daily spend by default, falls back to channel totals.
- Attribution: `channel_field` (customers.channelSourceId) by default; `acquired_via` mode can be chosen in Settings.

## 3. Import & Compute Pipeline

1. User uploads CSV in Import Wizard and maps headers → canonical fields (dataset types: customers, transactions, channels, events, acquiredVia, channelSpendDaily).
2. `import.worker` streams/validates rows, writes chunked batches, and records progress in `jobs` + `auditLog`.
3. After every import the UI schedules `compute.worker`, which:
   - Reads all base tables.
   - Computes churn windows based on configured event types.
   - Aggregates LTV + txn counts per customer, assigns HIGH/MID/LOW segments using configured quantiles.
   - Aggregates channel CAC + high-segment shares using either `customers.channelSourceId` or `acquiredVia` edges and spend inputs.
   - Writes `customerMetrics`, `segmentMetrics`, `channelMetrics` and emits a `RECOMPUTE` audit log entry.
4. Users can invoke recompute from the Segment Dashboard at any time.

## 4. Screens & Functionality

| Screen | What it delivers |
| --- | --- |
| **Project Home** | Hero copy + cards for creating/importing projects, list of existing projects with Open/Export/Delete actions. |
| **Import Wizard** | Two-panel experience with checklist sidebar, dataset selector, column mapping controls, preview table, commit button, and job history log. Imports trigger recompute automatically. |
| **Segment Dashboard** | KPI tiles (including blended LTV:CAC), segment & channel tables with ratio columns, customer/channel drilldown cards, and a recompute button. |
| **CAC Attribution Map** | SVG-based channel→segment beam diagram sized by customer count, color-coded by segment, with detail card including channel-level LTV:CAC. |
| **Spend Plan** | Recommendations bootstrap from channel metrics, editable table with LTV:CAC visibility, approval/export actions, and history list. |
| **Settings** | Forms for LTV windows, churn events, segment quantiles, CAC source, attribution mode, currency/timezone, and a “clear local data” button (wipes all stores). |
| **Audit Log** | Filter chips + table showing latest 200 events pulled from `auditLog`. |
| **Export** | Buttons for ZIP project bundle and dropdown-driven metrics CSV exporter. |

## 5. Supported Flows

| # | Flow | Status |
| --- | --- | --- |
| 1 | Create/open/delete project | **Tested (vitest)** – see `flows.spec.ts` “creates projects with defaults”. |
| 2 | Import customers (mapping, validation) | **Tested (vitest)** – “maps customer rows and warns on missing IDs”. |
| 3 | Import transactions & recompute | **Tested (vitest)** – “computes LTV, segments, and channel CAC…”. |
| 4 | Import channels + spend | **Tested (vitest)** – same compute test covers spend-driven CAC. |
| 5 | Acquisition link resolution | **Tested (vitest)** – “respects acquired_via attribution”. |
| 6 | Segment dashboard drilldowns | **Tested (vitest)** – validated through compute outputs feeding drilldowns. |
| 7 | Spend reallocation plan export | **Tested (vitest)** – “generates plan recommendations with positive/negative deltas”. |
| 8 | Project export/import | **Tested (vitest)** – “exports and reimports a project bundle”. |
| 9 | Crash recovery for jobs | **Not implemented** – jobs table tracks state but UI lacks resume/rollback controls. |
| 10 | Multi-tab safety | **Tested (vitest)** – “touches projects to support multi-tab awareness”. |

Automated regression coverage lives in `src/__tests__/flows.spec.ts` and runs via `npm run test`.

## 6. Export Formats

- **Project bundle**: `manifest.json` + JSONL files per store in a ZIP.
- **Action plan exports**: CSV (flat rows) or JSON (hierarchical object). Audit log records both approvals and exports.
- **Metrics CSVs**: Customer/channel/segment materializations can be downloaded individually.

## 7. Known Limitations

- No crash-resume UI for interrupted imports/recomputes (jobs store is write-only for now).
- No encryption for export bundles; user must secure files out-of-band.
- Spend recommendations are simple heuristics (top/bottom channels by LTV share). Future versions may add cohort analysis or multi-touch attribution.
