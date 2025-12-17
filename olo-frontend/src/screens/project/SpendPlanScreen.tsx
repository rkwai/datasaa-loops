import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { nanoid } from 'nanoid'
import { useProjectContext } from '../../context/ProjectContext'
import type { ActionPlanItem, ActionPlanRecord } from '../../db/types'

export function SpendPlanScreen() {
  const { db, projectId } = useProjectContext()
  const channelMetrics = useLiveQuery(() => db.channelMetrics.toArray(), [db]) ?? []
  const plans = useLiveQuery(() => db.actionPlans.orderBy('createdAt').reverse().toArray(), [db]) ?? []
  const [objective, setObjective] = useState('Increase HIGH segment efficiency')
  const [items, setItems] = useState<ActionPlanItem[]>([])
  const [approvedPlan, setApprovedPlan] = useState<ActionPlanRecord | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!channelMetrics.length) {
      setItems([])
      return
    }
    setItems(generateRecommendations(channelMetrics))
  }, [channelMetrics])

  const totalCurrentSpend = useMemo(
    () => items.reduce((sum, item) => sum + item.currentSpend, 0),
    [items],
  )
  const totalProposed = useMemo(
    () => items.reduce((sum, item) => sum + item.proposedSpend, 0),
    [items],
  )

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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Spend reallocation plan</h1>
          <p className="page-description">
            Generate rule-based guidance, fine-tune line items, and export a fully-audited plan for
            manual execution.
          </p>
        </div>
        {message && <span className="pill">{message}</span>}
      </div>

      <div className="split">
        <section className="surface" style={{ borderRadius: 28 }}>
          <label>Objective</label>
          <input value={objective} onChange={(e) => setObjective(e.target.value)} />
          <p className="page-description">
            Objectives stay with the plan export so downstream tools see the strategy context.
          </p>
          <div className="table-card" style={{ marginTop: '1.5rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Current spend</th>
                  <th>Proposed spend</th>
                  <th>Delta</th>
                  <th>Rationale</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.channelId}>
                    <td>{item.channelId}</td>
                    <td>{item.currentSpend.toFixed(2)}</td>
                    <td>
                      <input
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
                    </td>
                    <td>{item.delta.toFixed(2)}</td>
                    <td>{item.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="stat-grid" style={{ marginTop: '1.5rem' }}>
            <div className="stat-card">
              <h3>Current total</h3>
              <strong>{totalCurrentSpend.toFixed(2)}</strong>
            </div>
            <div className="stat-card">
              <h3>Proposed total</h3>
              <strong>{totalProposed.toFixed(2)}</strong>
            </div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={handleApprove} disabled={!items.length}>
              Approve plan
            </button>
            <button type="button" className="secondary" onClick={() => handleExport('csv')}>
              Export CSV
            </button>
            <button type="button" className="secondary" onClick={() => handleExport('json')}>
              Export JSON
            </button>
          </div>
        </section>

        <section className="surface" style={{ borderRadius: 28 }}>
          <h3 style={{ marginTop: 0 }}>Plan history</h3>
          {!plans.length && <p>No plans yet.</p>}
          {plans.length > 0 && (
            <div className="history-list">
              {plans.map((plan) => (
                <div className="log-entry" key={plan.planId}>
                  <div>
                    <strong>{plan.objective}</strong>
                    <p className="page-description" style={{ margin: 0 }}>
                      Approved {plan.approvedAt ? new Date(plan.approvedAt).toLocaleDateString() : '—'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="secondary" type="button" onClick={() => handleExport('json', plan)}>
                      Export JSON
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function generateRecommendations(channelMetrics: { channelId: string; cac: number; highLtvShare: number; spend: number }[]) {
  if (!channelMetrics.length) return [] as ActionPlanItem[]
  const sorted = [...channelMetrics].sort(
    (a, b) => b.highLtvShare - a.highLtvShare || a.cac - b.cac,
  )
  const best = sorted.slice(0, Math.min(3, sorted.length))
  const worst = sorted.slice(-Math.min(3, sorted.length))
  const shiftBudget = sorted.reduce((sum, item) => sum + item.spend, 0) * 0.1
  const perIncrease = best.length ? shiftBudget / best.length : 0
  const perDecrease = worst.length ? shiftBudget / worst.length : 0

  const items: ActionPlanItem[] = sorted.map((channel) => ({
    channelId: channel.channelId,
    currentSpend: channel.spend,
    proposedSpend: channel.spend,
    delta: 0,
    rationale: channel.highLtvShare > 0.5 ? 'High HIGH-LTV share' : 'Monitor',
  }))

  items.forEach((item) => {
    if (best.find((c) => c.channelId === item.channelId)) {
      item.proposedSpend = item.currentSpend + perIncrease
      item.delta = perIncrease
      item.rationale = 'Increase allocation to best-performing HIGH segment sources'
    } else if (worst.find((c) => c.channelId === item.channelId)) {
      item.proposedSpend = Math.max(0, item.currentSpend - perDecrease)
      item.delta = -perDecrease
      item.rationale = 'Decrease due to low HIGH-LTV share or high CAC'
    }
  })

  return items
}
