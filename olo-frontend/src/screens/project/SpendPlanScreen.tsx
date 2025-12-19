import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { nanoid } from 'nanoid'
import { useProjectContext } from '../../context/useProjectContext'
import type { ActionPlanItem, ActionPlanRecord, ChannelMetricsRecord } from '../../db/types'
import { generateRecommendations, type AllocationStrategy } from '../../utils/spendPlan'

interface StrategyOption {
  key: AllocationStrategy
  label: string
  description: string
  bullets: string[]
}

const OBJECTIVE_OPTIONS: StrategyOption[] = [
  {
    key: 'high_efficiency',
    label: 'Increase HIGH segment efficiency',
    description:
      'Use this when you need to raise the blended LTV:CAC quickly. We funnel extra dollars into the channels creating the highest share of HIGH-segment customers and stop rewarding under-performers.',
    bullets: [
      'Reroutes ~12% of spend toward the best HIGH-share, efficient CAC channels.',
      'Cuts that budget from sources with <20% HIGH mix or LTV:CAC below 1.2x, so weak ratios are not funded.',
    ],
  },
  {
    key: 'maximize_revenue',
    label: 'Maximize revenue',
    description:
      'Pick this when leadership cares most about topline growth. We overweight the channels that have the strongest positive net value even if their CAC is higher, while draining net-negative efforts.',
    bullets: [
      'Invests aggressively in channels with positive net value and large LTV contributions.',
      'Reduces or freezes channels that are net-negative or below 1.4x LTV:CAC and explains when we must keep a baseline for coverage.',
    ],
  },
  {
    key: 'stability',
    label: 'Target CPA stability',
    description:
      'Choose this when you want gentle adjustments that protect the blended CAC. We only move ~6% of budget, nudging dependable channels up and trimming risky outliers.',
    bullets: [
      'Boosts steady 2-3.5x LTV:CAC channels just enough to offset weaker ones.',
      'Cuts sources that fall below 1.2x so inefficient spend is minimized while most channels remain unchanged.',
    ],
  },
]

const scheduleStateUpdate = (fn: () => void) => {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(fn)
  } else {
    Promise.resolve().then(fn)
  }
}

export function SpendPlanScreen() {
  const { db, projectId } = useProjectContext()
  const liveChannelMetrics = useLiveQuery(() => db.channelMetrics.toArray(), [db])
  const channelMetrics = useMemo(() => liveChannelMetrics ?? [], [liveChannelMetrics])
  const plans = useLiveQuery(() => db.actionPlans.orderBy('createdAt').reverse().toArray(), [db]) ?? []
  const [objective, setObjective] = useState<AllocationStrategy>(OBJECTIVE_OPTIONS[0].key)
  const [items, setItems] = useState<ActionPlanItem[]>([])
  const [approvedPlan, setApprovedPlan] = useState<ActionPlanRecord | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const selectedObjective = OBJECTIVE_OPTIONS.find((option) => option.key === objective) ?? OBJECTIVE_OPTIONS[0]

  useEffect(() => {
    if (!channelMetrics.length) {
      scheduleStateUpdate(() => setItems([]))
      return
    }
    scheduleStateUpdate(() => setItems(generateRecommendations(channelMetrics, objective)))
  }, [channelMetrics, objective])

  const totalCurrentSpend = useMemo(
    () => items.reduce((sum, item) => sum + item.currentSpend, 0),
    [items],
  )
  const totalProposed = useMemo(
    () => items.reduce((sum, item) => sum + item.proposedSpend, 0),
    [items],
  )
  const totalDelta = totalProposed - totalCurrentSpend

  const channelMetricMap = useMemo(
    () => new Map(channelMetrics.map((metric) => [metric.channelId, metric])),
    [channelMetrics],
  )

  const ratioByChannel = new Map(
    channelMetrics.map((metric) => {
      const avgLtv = Number.isFinite(metric.avgLtv) ? metric.avgLtv : 0
      const cac = Number.isFinite(metric.cac) ? metric.cac : 0
      return [metric.channelId, cac > 0 ? avgLtv / cac : 0]
    }),
  )

  const projectedRoi = totalCurrentSpend ? (totalProposed / totalCurrentSpend - 1) * 100 : 0
  const revenueLift = items.reduce((sum, item) => {
    const ratio = ratioByChannel.get(item.channelId) ?? 1
    return sum + Math.max(item.delta, 0) * ratio
  }, 0)

  const strategyImpact = useMemo(() => {
    const increases = items.filter((item) => item.delta > 1)
    const decreases = items.filter((item) => item.delta < -1)
    const held = Math.max(items.length - increases.length - decreases.length, 0)
    const addTotal = increases.reduce((sum, item) => sum + item.delta, 0)
    const cutTotal = Math.abs(decreases.reduce((sum, item) => sum + item.delta, 0))
    const averageFrom = (list: ActionPlanItem[], picker: (metric: ChannelMetricsRecord) => number) => {
      const values = list
        .map((item) => channelMetricMap.get(item.channelId))
        .filter((metric): metric is ChannelMetricsRecord => Boolean(metric))
        .map(picker)
        .filter((value) => Number.isFinite(value))
      if (!values.length) return null
      return values.reduce((sum, value) => sum + value, 0) / values.length
    }
    return {
      increases,
      decreases,
      held,
      addTotal,
      cutTotal,
      avgHighShare: averageFrom(increases, (metric) => metric.highLtvShare),
      avgIncreaseRatio: averageFrom(increases, (metric) => (metric.cac > 0 ? metric.avgLtv / metric.cac : 0)),
      avgDecreaseRatio: averageFrom(decreases, (metric) => (metric.cac > 0 ? metric.avgLtv / metric.cac : 0)),
    }
  }, [items, channelMetricMap])

  const formatPercent = (value: number | null) =>
    value === null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(0)}%`
  const formatRatioText = (value: number | null) =>
    value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}x`

  async function handleApprove() {
    if (!items.length) return
    const planId = `plan-${nanoid(6)}`
    const planObjective = selectedObjective?.label ?? OBJECTIVE_OPTIONS[0].label
    const record: ActionPlanRecord = {
      planId,
      objective: planObjective,
      modelVersion: 1,
      createdAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      items,
    }
    await db.actionPlans.put(record)
    await db.auditLog.add({
      ts: new Date().toISOString(),
      type: 'ACTION_PLAN_APPROVED',
      projectId,
      userLabel: 'local-user',
      payload: { planId },
    })
    setApprovedPlan(record)
    setMessage('Plan approved locally.')
  }

  async function handleExport(format: 'csv' | 'json', plan?: ActionPlanRecord | null) {
    const targetPlan = plan ?? approvedPlan
    if (!targetPlan) return
    let blob: Blob
    if (format === 'json') {
      blob = new Blob([JSON.stringify(targetPlan, null, 2)], { type: 'application/json' })
    } else {
      const header =
        'plan_id,created_at,objective,channel_id,current_spend,proposed_spend,delta,rationale,model_version'
      const rows = targetPlan.items
        .map((item) =>
          [
            targetPlan.planId,
            targetPlan.createdAt,
            targetPlan.objective,
            item.channelId,
            item.currentSpend,
            item.proposedSpend,
            item.delta,
            JSON.stringify(item.rationale),
            targetPlan.modelVersion,
          ].join(','),
        )
        .join('\n')
      blob = new Blob([`${header}\n${rows}`], { type: 'text/csv' })
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${targetPlan.planId}.${format === 'json' ? 'json' : 'csv'}`
    link.click()
    URL.revokeObjectURL(url)
    await db.auditLog.add({
      ts: new Date().toISOString(),
      type: 'ACTION_PLAN_EXPORTED',
      projectId,
      userLabel: 'local-user',
      payload: { planId: targetPlan.planId, format },
    })
    await db.actionPlans.update(targetPlan.planId, {
      exportedAt: new Date().toISOString(),
    })
    setMessage(`Exported ${format.toUpperCase()} bundle`)
  }

  const budgetStatus =
    Math.abs(totalDelta) < 1
      ? 'Within budget'
      : totalDelta > 0
        ? 'Over budget'
        : 'Under budget'

  return (
    <div className="spend-shell">
      <section className="spend-hero">
        <div className="spend-breadcrumb">
          <span>Optimization</span>
          <span className="material-symbols-outlined">chevron_right</span>
          <span>Q3 Strategy</span>
        </div>
        <div className="spend-hero-header">
          <div>
            <h1>Spend reallocation</h1>
            <p>Keep the blended LTV:CAC ratio above target by shifting spend toward the loops that consistently pay back.</p>
          </div>
          {message && (
            <span className="pill" data-testid="plan-status">
              {message}
            </span>
          )}
        </div>
        <div className="objective-toggle">
          {OBJECTIVE_OPTIONS.map((option) => (
            <label key={option.key}>
              <input
                type="radio"
                name="objective"
                value={option.key}
                checked={objective === option.key}
                onChange={() => setObjective(option.key)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        {selectedObjective && (
          <div className="strategy-explainer">
            <div className="strategy-explainer-text">
              <h3>{selectedObjective.label}</h3>
              <p>{selectedObjective.description}</p>
            </div>
            <ul>
              {selectedObjective.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <div className="strategy-stats">
              <div>
                <span>Reinvesting</span>
                <strong>${Math.max(strategyImpact.addTotal, 0).toFixed(0)}</strong>
                <small>
                  {strategyImpact.increases.length} channels · avg {formatPercent(strategyImpact.avgHighShare)} HIGH /{' '}
                  {formatRatioText(strategyImpact.avgIncreaseRatio)} LTV:CAC
                </small>
              </div>
              <div>
                <span>Cutting</span>
                <strong>${Math.max(strategyImpact.cutTotal, 0).toFixed(0)}</strong>
                <small>
                  {strategyImpact.decreases.length} channels · avg {formatRatioText(strategyImpact.avgDecreaseRatio)} LTV:CAC
                </small>
              </div>
              <div>
                <span>Held steady</span>
                <strong>{strategyImpact.held}</strong>
                <small>channels unchanged</small>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="spend-summary-grid">
        <article className="spend-summary-card">
          <div className="icon-circle positive">
            <span className="material-symbols-outlined">trending_up</span>
          </div>
          <p>Projected ROI</p>
          <strong>{Number.isFinite(projectedRoi) ? `${projectedRoi.toFixed(1)}%` : '—'}</strong>
          <span>vs current allocation</span>
        </article>
        <article className="spend-summary-card">
          <div className="icon-circle neutral">
            <span className="material-symbols-outlined">account_balance_wallet</span>
          </div>
          <p>Total spend delta</p>
          <strong>${totalDelta.toFixed(0)}</strong>
          <span>{budgetStatus}</span>
        </article>
        <article className="spend-summary-card">
          <div className="icon-circle positive">
            <span className="material-symbols-outlined">attach_money</span>
          </div>
          <p>Est. revenue lift</p>
          <strong>${revenueLift.toFixed(0)}</strong>
          <span>Based on channel ROAS</span>
        </article>
      </section>

      <section className="spend-table-panel">
        <header>
          <div>
            <h2>Budget recommendations</h2>
            <p>{items.length} channels · auto-calculated deltas</p>
          </div>
          <div className="spend-table-actions">
            <button type="button" className="ghost" onClick={() => handleExport('csv')}>
              <span className="material-symbols-outlined">download</span>
              Export CSV
            </button>
            <button type="button" className="ghost" onClick={() => handleExport('json')}>
              <span className="material-symbols-outlined">code</span>
              Export JSON
            </button>
          </div>
        </header>
        <div className="dashboard-table" style={{ marginTop: '1rem' }}>
          <table>
            <thead>
              <tr>
                <th>Channel source</th>
                <th>Current ratio</th>
                <th className="text-right">Current budget</th>
                <th>Rec. adjustment</th>
                <th>New budget (editable)</th>
                <th className="text-right">Projected ROAS</th>
                <th className="text-right">Result</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const ratio = ratioByChannel.get(item.channelId) ?? 0
                const adjustment =
                  item.currentSpend === 0 ? 0 : ((item.proposedSpend - item.currentSpend) / item.currentSpend) * 100
                return (
                  <tr key={item.channelId}>
                    <td>
                      <div className="channel-cell">
                        <div className="icon-circle neutral">
                          <span className="material-symbols-outlined">stacked_line_chart</span>
                        </div>
                        <div>
                          <strong>{item.channelId}</strong>
                          <span>Delta {item.delta >= 0 ? '+' : ''}${item.delta.toFixed(0)}</span>
                          <small>{item.rationale}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {Number.isFinite(ratio) ? ratio.toFixed(2) : '—'}{' '}
                      {ratio >= 3 && <span className="badge">Target</span>}
                    </td>
                    <td className="text-right">${item.currentSpend.toFixed(0)}</td>
                    <td>
                      <span className={`adjust-pill ${adjustment >= 0 ? 'up' : 'down'}`}>
                        <span className="material-symbols-outlined">
                          {adjustment >= 0 ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                        {Math.abs(adjustment).toFixed(0)}%
                      </span>
                    </td>
                    <td>
                      <div className="input-wrapper">
                        <span>$</span>
                        <input
                          data-testid={`spend-input-${item.channelId}`}
                          type="number"
                          value={item.proposedSpend}
                          onChange={(e) => {
                            const next = [...items]
                            next[idx] = {
                              ...next[idx],
                              proposedSpend: Number(e.target.value),
                              delta: Number(e.target.value) - next[idx].currentSpend,
                            }
                            setItems(next)
                          }}
                        />
                      </div>
                    </td>
                    <td className="text-right">{Number.isFinite(ratio) ? `${ratio.toFixed(1)}x` : '--'}</td>
                    <td className={`text-right ${item.delta >= 0 ? 'positive' : 'negative'}`}>
                      {item.delta >= 0 ? '+' : ''}
                      ${item.delta.toFixed(0)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="spend-history-panel">
        <h3>Plan history</h3>
        {!plans.length && <p>No plans yet.</p>}
        {plans.length > 0 && (
          <div className="history-list">
            {plans.map((plan) => (
              <div className="log-entry" key={plan.planId}>
                <div>
                  <strong>{plan.objective}</strong>
                  <span className="page-description">
                    Approved {plan.approvedAt ? new Date(plan.approvedAt).toLocaleDateString() : '—'}
                  </span>
                </div>
                <button className="secondary" type="button" onClick={() => handleExport('json', plan)}>
                  Export JSON
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="spend-footer">
        <div className="spend-footer-metrics">
          <div>
            <span>Total reallocated&nbsp;</span>
            <strong>
              ${totalProposed.toFixed(0)} <small>of ${totalCurrentSpend.toFixed(0)}</small>
            </strong>
          </div>
          <div className={`badge ${budgetStatus === 'Within budget' ? 'positive' : 'negative'}`}>{budgetStatus}</div>
        </div>
        <div className="spend-footer-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => setItems(generateRecommendations(channelMetrics, objective))}
          >
            Discard
          </button>
          <button type="button" className="ghost" onClick={() => handleExport('csv')}>
            <span className="material-symbols-outlined">ios_share</span>
            Export CSV
          </button>
          <button type="button" data-testid="approve-plan" onClick={handleApprove} disabled={!items.length}>
            <span className="material-symbols-outlined">check</span>
            Approve plan
          </button>
        </div>
      </footer>
    </div>
  )
}
