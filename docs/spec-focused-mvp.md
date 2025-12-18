Here’s a compact, drop‑in “rule‑card” you can use to turn company news into clean, revenue‑tied signals—no heavy setup required.

```yaml
ontology_v2:
  objects:
    Company: {company_id: string, ticker: string, sector: string}
    Product: {product_id: string, company_id: string, product_family: string, hbm_count?: int}
    Design_Win: {win_id: string, product_id: string, customer_id: string, nre_usd: number, eval_kits_shipped: int, nda_signed: bool, announced_date: date}
    Production_Run: {run_id: string, win_id: string, po_value_usd: number, po_date: date, first_article_ship_date: date, units: int, yield_percent: number, asp_usd: number}
  joins:
    - Company.company_id -> Product.company_id
    - Product.product_id -> Design_Win.product_id
    - Design_Win.win_id -> Production_Run.win_id
  kpis:
    - DesignWinToPOConversionRate: {numerator: num_pos, denominator: num_design_wins, window_months: int}
    - FirstArticleLeadTimeDays: {median_days}
    - YieldImpactOnGM: {delta_yield_pct -> delta_gm_pct}
    - RevenueRecognitionLag: {first_article_ship_date -> recognized_revenue_date}
```

### What this is (in plain English)

* **Design win → PO → first article → yield → gross margin/OCF** as a single path.
* You’ll tag raw events (press releases, 8‑Ks, call snippets) to these objects so your KPIs roll up directly to revenue timing and margin.

### Attach‑rules (state machine + telemetry)

1. **Acquire (onramp)**
   Telemetry: `eval_kits_shipped`, `nda_signed`, `nre_usd`.
   **Trigger:** mark `Design_Win` as *in‑onramp* when `nre_usd >= $X` **OR** `eval_kits_shipped >= Y`.
   **KPI:** `DesignWinToPOConversionRate` over a 6‑mo window.

2. **Convert (production)**
   Telemetry: `po_value_usd`, `po_date`, `first_article_ship_date`, initial `yield_percent`.
   **Trigger:** promote to *production* when `po_value_usd >= $Z` **AND** `first_article_ship_date` exists.
   **KPI:** `FirstArticleLeadTimeDays` (median).

3. **Scale (monetize)**
   Telemetry: monthly `units`, `asp_usd`, `yield_percent`, `cost_per_unit`.
   **Trigger:** flag *revenue inflection* when `monthly_units` > 3× baseline **AND** `yield_percent` improves > 10ppt.
   **KPI:** `YieldImpactOnGM` (e.g., +10ppt yield ⇒ ~4–7ppt GM lift) and quarters to positive **OCF**.

### Worked example — GSIT (hypothetical, calibratable)

* **Company:** `{company_id: "gsit", ticker: "GSIT", sector: "semiconductors"}`
* **Design_Win:** `{win_id: "gsit-win-001", product_id: "gsit-p1", customer_id: "hyp-cust-A", nre_usd: 120000, eval_kits_shipped: 25, nda_signed: true, announced_date: "2025-11-01"}`
* **Production_Run:** `{run_id: "gsit-run-001", win_id: "gsit-win-001", po_value_usd: 2400000, po_date: "2026-02-15", first_article_ship_date: "2026-03-20", units: 50000, yield_percent: 62, asp_usd: 0.08}`

**Calibration tips**

* Thresholds: `X = $100k` NRE (onramp), `Z = $1M` PO (meaningful rev), *first article* within **3–6 months** of PO.
* Rule‑of‑thumb mapping: **+10ppt yield → ~4–7ppt GM** (tune by product).
* Revenue recognition tends to hit the **first full quarter** after first‑article; **OCF** usually lags by **1–2 quarters** (payment terms dependent).

### How to use it now

* **Paste** the YAML into your Ontological Profiler.
* **Wire** sources: 10‑Q/8‑K, press/IR feeds, earnings transcripts.
* **Automate** the three state transitions (onramp → production → scale) using simple extractors for NRE/PO/first‑article/yield phrases.
* **Monitor** the three KPIs; trigger alerts on threshold crosses.
