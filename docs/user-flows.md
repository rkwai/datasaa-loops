# User Flows

These flows mirror the structure shown in `docs/mock-ups/layout.html` and are fully supported in-app.

## 1. Data Intake → Compute Refresh
1. From **Project Home**, create or select a project.
2. Open **Data intake** (Import Wizard) to upload CSVs for customers, transactions, channels, events, acquired-via, and spend.
3. Map headers to canonical fields, inspect the preview, and commit the import.
4. The import worker writes into IndexedDB and the compute worker runs automatically, refreshing customer/channel/segment materializations and the blended LTV:CAC ratio.

## 2. LTV↔CAC Diagnosis
1. Navigate to **LTV ↔ CAC view** to see KPIs (total customers, revenue, blended LTV:CAC) plus segment and channel tables with ratio columns.
2. Drill into a segment or channel to view customer-level metrics and verify whether cohorts are meeting the target ratio.
3. Jump to the **LTV→CAC map** to visualize channel → segment beams; inspect a beam to compare its channel-level LTV:CAC and count.

## 3. Budget Shift & Action Plan
1. Open **Spend plan** to load heuristic recommendations seeded from channel performance.
2. Review per-channel LTV:CAC, adjust proposed spend, and ensure the ratio stays above target for prioritized channels.
3. Approve the plan, log the action locally, and export CSV/JSON for activation in downstream tools.

## 4. Governance & Safeguards
1. Use **Model settings** to tweak LTV windows, churn events, CAC source, attribution mode, and localization, matching the settings mock in `layout.html`.
2. Reference the **Audit log** to confirm imports, recomputes, settings edits, plan approvals, and exports are recorded per project.
3. Visit **Exports** to create ZIP bundles (manifest + JSONL) and download metrics CSVs; import them later from Project Home.
4. Multitab safety ensures only one tab writes at once (others are read-only) and every project lists last-opened time.

These flows represent the end-to-end journey required to measure and improve the LTV:CAC ratio for high-value segments, staying faithful to the provided mock-ups.
