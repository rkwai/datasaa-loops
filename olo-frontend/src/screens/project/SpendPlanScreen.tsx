import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { nanoid } from 'nanoid'
import { useProjectContext } from '../../context/useProjectContext'
import type { ActionPlanItem, ActionPlanRecord } from '../../db/types'
import { generateRecommendations } from '../../utils/spendPlan'

const OBJECTIVE_PRESETS = [
  'Increase HIGH segment efficiency',
  'Maximize revenue',
  'Target CPA stability',
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
  const [objective, setObjective] = useState(OBJECTIVE_PRESETS[0])
  const [items, setItems] = useState<ActionPlanItem[]>([])
  const [approvedPlan, setApprovedPlan] = useState<ActionPlanRecord | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!channelMetrics.length) {
      scheduleStateUpdate(() => setItems([]))
      return
    }
    scheduleStateUpdate(() => setItems(generateRecommendations(channelMetrics)))
  }, [channelMetrics])

  const totalCurrentSpend = useMemo(
    () => items.reduce((sum, item) => sum + item.currentSpend, 0),
    [items],
  )
  const totalProposed = useMemo(
    () => items.reduce((sum, item) => sum + item.proposedSpend, 0),
    [items],
  )
  const totalDelta = totalProposed - totalCurrentSpend

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

  async function handleApprove() {
    if (!items.length) return
    const planId = `plan-${nanoid(6)}`
    const record: ActionPlanRecord = {
      planId,
      objective,
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
            <p>Optimize your operational loops by reallocating budget to high-performing channels.</p>
          </div>
    {message && (
      <span className="pill" data-testid="plan-status">
        {message}
      </span>
    )}
        </div>
        <div className="objective-toggle">
          {OBJECTIVE_PRESETS.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="objective"
                value={option}
                checked={objective === option}
                onChange={() => setObjective(option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
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
            <span>Total reallocated</span>
            <strong>
              ${totalProposed.toFixed(0)} <small>of ${totalCurrentSpend.toFixed(0)}</small>
            </strong>
          </div>
          <div className={`badge ${budgetStatus === 'Within budget' ? 'positive' : 'negative'}`}>{budgetStatus}</div>
        </div>
        <div className="spend-footer-actions">
          <button type="button" className="ghost" onClick={() => setItems(generateRecommendations(channelMetrics))}>
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
