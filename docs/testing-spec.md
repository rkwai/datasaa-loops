# Testing Spec

## Goal

- Ensure the organization can continuously identify the CAC↔LTV ratio of its best segments and reallocate spend to optimize that ratio.

---

### KPI: “Data readiness” — Given source files exist locally, when a workspace ingests canonical datasets, then CAC & LTV metrics are recomputed without external services.

- **Unit coverage:** `src/__tests__/flows.spec.ts` › `computes LTV, segments, and channel CAC for channel_field attribution (Flows 3/4/6)`  
- **E2E coverage:** `tests-e2e/flows.spec.ts` › `user flows: data intake, ratio views, spend plan, governance, exports` (steps 1–2)

#### Demo steps
1. Launch app → “Create new project” modal → input project name/currency/timezone → submit and land in workspace.
2. Navigate to “Data intake” → upload each CSV (customers, transactions, channels, spend) → map columns in the modal → wait for “All data processed!”.

---

### KPI: “Insight visibility” — Given recomputed metrics, when stakeholders review segment + attribution dashboards, then high-value cohorts and their originating channels are obvious.

- **Unit coverage:** `src/__tests__/flows.spec.ts` › `computes LTV, segments, and channel CAC for channel_field attribution (Flows 3/4/6)`
- **E2E coverage:** `tests-e2e/flows.spec.ts` › `user flows: data intake, ratio views, spend plan, governance, exports` (steps 3–4)

#### Demo steps
1. Open “LTV ↔ CAC view”, read KPI cards (total customers, revenue, avg LTV, LTV:CAC), and interact with segment/channel tables.
2. Go to “LTV→CAC map”, click a channel→segment beam, and show the connection detail card (volume, avg LTV, ratio).

---

### KPI: “Actionable reallocations” — Given insights, when a spend plan is generated/edited/approved, then proposed budgets keep the blended LTV:CAC above target.

- **Unit coverage:** `src/__tests__/flows.spec.ts` › `generates plan recommendations with positive/negative deltas (Flow 7)`
- **E2E coverage:** `tests-e2e/flows.spec.ts` › `user flows: data intake, ratio views, spend plan, governance, exports` (step 5)

#### Demo steps
1. Move to “Spend plan”, tweak a proposed budget, approve the plan, and note the status pill plus updated totals.

---

### KPI: “Governance & auditability” — Given configuration or plan changes, when settings are saved or plans exported, then the local audit log reflects who/what/when for every change.

- **Unit coverage:** `src/__tests__/flows.spec.ts` › `exports and reimports a project bundle (Flow 8)` and `touches projects to support multi-tab awareness (Flow 10)`
- **E2E coverage:** `tests-e2e/flows.spec.ts` › `user flows: data intake, ratio views, spend plan, governance, exports` (steps 6–7)

#### Demo steps
1. Head to “Model settings”, adjust the LTV window, and click “Save changes”.
2. Jump to “Audit log”, verify the SETTINGS_CHANGE entry, and mention the export option.

