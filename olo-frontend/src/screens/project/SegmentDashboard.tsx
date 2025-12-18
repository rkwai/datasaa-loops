import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { nanoid } from 'nanoid'
import { useProjectContext } from '../../context/useProjectContext'
import type { SegmentKey } from '../../db/types'
import { runComputeJob } from '../../utils/workers'

export function SegmentDashboard() {
  const { db, meta, projectId } = useProjectContext()
  const segmentMetrics = useLiveQuery(() => db.segmentMetrics.toArray(), [db]) ?? []
  const channelMetrics = useLiveQuery(() => db.channelMetrics.toArray(), [db]) ?? []
  const totalCustomers = segmentMetrics.reduce((sum, seg) => sum + seg.customerCount, 0)
  const totalRevenue = segmentMetrics.reduce((sum, seg) => sum + seg.totalRevenue, 0)
  const totalSpend = channelMetrics.reduce((sum, channel) => sum + channel.spend, 0)
  const ltvToCacRatio = totalSpend > 0 ? totalRevenue / totalSpend : 0
  const avgLtv = totalCustomers ? totalRevenue / totalCustomers : 0
  const topSegment = [...segmentMetrics].sort((a, b) => b.avgLtv - a.avgLtv)[0]

  const [selectedSegment, setSelectedSegment] = useState<SegmentKey | 'ALL'>('ALL')
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null)

  const channelRatios = channelMetrics.map((channel) => {
    const avgLtvChannel = Number.isFinite(channel.avgLtv) ? channel.avgLtv : 0
    const cac = Number.isFinite(channel.cac) ? channel.cac : 0
    return {
      ...channel,
      avgLtv: avgLtvChannel,
      ratio: cac > 0 ? avgLtvChannel / cac : 0,
    }
  })
  const healthiestChannel = channelRatios.length
    ? channelRatios.slice().sort((a, b) => b.ratio - a.ratio)[0]
    : null

  const drilldownCustomers = useLiveQuery(async () => {
    if (!selectedSegment || selectedSegment === 'ALL') return []
    return db.customerMetrics.where('ltvSegment').equals(selectedSegment).limit(50).toArray()
  }, [db, selectedSegment])

  const channelCustomers = useLiveQuery(async () => {
    if (!selectedChannel) return []
    let customers = await db.customers.where('channelSourceId').equals(selectedChannel).limit(50).toArray()
    if (!customers.length) {
      const edges = await db.acquiredVia.where('channelId').equals(selectedChannel).limit(50).toArray()
      const fallbackCustomers = await db.customers.bulkGet(edges.map((edge) => edge.customerId))
      customers = fallbackCustomers.filter(Boolean) as typeof customers
    }
    const customerIds = customers.map((c) => c.customerId)
    const metrics = await db.customerMetrics.bulkGet(customerIds)
    return customers.map((customer, idx) => ({
      customer,
      metric: metrics[idx],
    }))
  }, [db, selectedChannel])

  const [recomputeStatus, setRecomputeStatus] = useState<string | null>(null)

  async function handleRecompute() {
    const jobId = `compute-${nanoid(6)}`
    await db.jobs.put({
      jobId,
      type: 'compute',
      status: 'RUNNING',
      processedRows: 0,
      phase: 'queued',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    await runComputeJob(
      { projectId, jobId },
      (progress) => setRecomputeStatus(`Recompute: ${progress.phase}`),
    )
    setRecomputeStatus('Recompute complete')
  }

  const currencyFormatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: meta.currency,
    maximumFractionDigits: 0,
  })

  const kpis = [
    {
      label: 'Total customers',
      value: totalCustomers.toLocaleString(),
      change: '+12%',
      tone: 'positive',
      icon: 'group',
    },
    {
      label: 'Total revenue',
      value: currencyFormatter.format(totalRevenue),
      change: '+8%',
      tone: 'positive',
      icon: 'payments',
    },
    {
      label: 'Avg LTV',
      value: currencyFormatter.format(avgLtv),
      change: '-2%',
      tone: 'negative',
      icon: 'loyalty',
    },
    {
      label: 'Top segment',
      value: topSegment ? `${topSegment.segmentKey}` : '—',
      change: topSegment ? `${Math.round(topSegment.avgLtv)} avg LTV` : 'Import data to begin',
      tone: 'neutral',
      icon: 'pie_chart',
    },
    {
      label: 'LTV : CAC ratio',
      value: Number.isFinite(ltvToCacRatio) ? ltvToCacRatio.toFixed(2) : '—',
      change: ltvToCacRatio >= 3 ? 'On target' : 'Needs attention',
      tone: ltvToCacRatio >= 3 ? 'positive' : 'negative',
      icon: 'equalizer',
      testId: 'kpi-ltv-cac',
    },
    {
      label: 'Spend captured',
      value: currencyFormatter.format(totalSpend),
      change: healthiestChannel ? `${healthiestChannel.channelId} leading ratio` : 'Awaiting data',
      tone: 'neutral',
      icon: 'bolt',
    },
  ]

  return (
    <div className="dashboard-shell">
      <section className="dashboard-hero-panel">
        <div>
          <div className="dashboard-chip">Analytics</div>
          <h1>Segment overview</h1>
          <p>
            Visualize how each operational loop contributes to CAC payback and pinpoint the channels that
            reliably produce high-value customers.
          </p>
        </div>
        <div className="dashboard-hero-actions">
          <button className="secondary" type="button">
            Export metrics
          </button>
          <button type="button" onClick={handleRecompute}>
            Sync data
          </button>
          {recomputeStatus && <span className="page-description">{recomputeStatus}</span>}
        </div>
      </section>

      <div className="dashboard-filter-row">
        <button type="button" className="dashboard-filter">
          Last 30 days <span>▾</span>
        </button>
        <button type="button" className="dashboard-filter">
          All regions <span>▾</span>
        </button>
        <button type="button" className="dashboard-filter">
          Paid &amp; Organic <span>▾</span>
        </button>
        <button type="button" className="dashboard-filter ghost-filter">
          +
        </button>
      </div>

      <section className="dashboard-kpis">
        {kpis.map((kpi) => (
          <article
            key={kpi.label}
            className={`dashboard-kpi-card tone-${kpi.tone}`}
            data-testid={kpi.testId}
          >
            <div className="kpi-icon">
              <span className="material-symbols-outlined">{kpi.icon}</span>
            </div>
            <p className="kpi-label">{kpi.label}</p>
            <strong className="kpi-value">{kpi.value}</strong>
            <span className="kpi-change">{kpi.change}</span>
          </article>
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <div className="panel-title">
                <span className="material-symbols-outlined">tune</span>
                Segment breakdown
              </div>
              <p className="page-description">Keep blended ratios above 3:1 for durable CAC payback.</p>
            </div>
            <button className="ghost" type="button" onClick={() => setSelectedSegment('ALL')}>
              Reset
            </button>
          </div>
          <div className="dashboard-table">
            <table>
              <thead>
                <tr>
                  <th>Segment</th>
                  <th>Customers</th>
                  <th>Avg LTV</th>
                  <th>LTV:CAC*</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {segmentMetrics.map((segment) => (
                  <tr key={segment.segmentKey}>
                    <td>
                      <button
                        className={selectedSegment === segment.segmentKey ? 'pill-button active' : 'pill-button'}
                        type="button"
                        onClick={() => setSelectedSegment(segment.segmentKey)}
                      >
                        {segment.segmentKey}
                      </button>
                    </td>
                    <td>{segment.customerCount.toLocaleString()}</td>
                    <td>{currencyFormatter.format(segment.avgLtv)}</td>
                    <td>
                      {totalSpend > 0 && totalCustomers > 0
                        ? (segment.avgLtv / (totalSpend / totalCustomers)).toFixed(2)
                        : '—'}
                    </td>
                    <td>{currencyFormatter.format(segment.totalRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <div className="panel-title">
                <span className="material-symbols-outlined">hub</span>
                Channel performance
              </div>
              {healthiestChannel && (
                <p className="page-description">
                  Best ratio: {healthiestChannel.channelId} ({healthiestChannel.ratio.toFixed(2)}x)
                </p>
              )}
            </div>
            <button className="ghost" type="button" onClick={() => setSelectedChannel(null)}>
              Reset
            </button>
          </div>
          <div className="dashboard-table">
            <table>
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>CAC</th>
                  <th>Avg LTV</th>
                  <th>LTV:CAC</th>
                  <th>High-LTV %</th>
                </tr>
              </thead>
              <tbody>
                {channelRatios.map((channel) => (
                  <tr key={channel.channelId}>
                    <td>
                      <button
                        className={selectedChannel === channel.channelId ? 'pill-button active' : 'pill-button'}
                        type="button"
                        onClick={() => setSelectedChannel(channel.channelId)}
                      >
                        {channel.channelId}
                      </button>
                    </td>
                    <td>{channel.cac.toFixed(2)}</td>
                    <td>{channel.avgLtv.toFixed(2)}</td>
                    <td>
                      {Number.isFinite(channel.ratio) ? channel.ratio.toFixed(2) : '—'}
                      {channel.ratio >= 3 && <span className="badge">Target</span>}
                    </td>
                    <td>{(channel.highLtvShare * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="dashboard-grid" style={{ alignItems: 'stretch' }}>
        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <div className="panel-title">
                <span className="material-symbols-outlined">groups_2</span>
                Segment drilldown ({selectedSegment})
              </div>
              <p className="page-description">
                {selectedSegment === 'ALL'
                  ? 'Select a segment above to inspect customers.'
                  : 'Latest 50 customers in this cohort.'}
              </p>
            </div>
          </div>
          {selectedSegment !== 'ALL' && !drilldownCustomers && <p>Loading...</p>}
          {selectedSegment !== 'ALL' && drilldownCustomers && drilldownCustomers.length === 0 && (
            <p>No customers yet.</p>
          )}
          {selectedSegment !== 'ALL' && drilldownCustomers && drilldownCustomers.length > 0 && (
            <div className="dashboard-table">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>LTV</th>
                    <th>Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {drilldownCustomers.map((customer) => (
                    <tr key={customer.customerId}>
                      <td>{customer.customerId}</td>
                      <td>{customer.ltv.toFixed(2)}</td>
                      <td>{customer.txnCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selectedSegment === 'ALL' && <p className="page-description">Pick a segment to view customers.</p>}
        </section>
        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <div className="panel-title">
                <span className="material-symbols-outlined">share</span>
                Channel drilldown ({selectedChannel ?? 'choose channel'})
              </div>
              <p className="page-description">Tap a channel tile above to populate this view.</p>
            </div>
          </div>
          {selectedChannel && channelCustomers && channelCustomers.length === 0 && <p>No linked customers yet.</p>}
          {selectedChannel && channelCustomers && channelCustomers.length > 0 && (
            <div className="dashboard-table">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>LTV</th>
                    <th>Segment</th>
                  </tr>
                </thead>
                <tbody>
                  {channelCustomers.map(({ customer, metric }) => (
                    <tr key={customer.customerId}>
                      <td>{customer.customerId}</td>
                      <td>{metric?.ltv.toFixed(2) ?? '—'}</td>
                      <td>{metric?.ltvSegment ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!selectedChannel && <p className="page-description">Choose a channel to explore recent acquisitions.</p>}
        </section>
      </div>
      <p className="page-description" style={{ marginTop: '0.75rem' }}>
        *Segment avg LTV divided by blended CAC (total spend ÷ total customers)
      </p>
    </div>
  )
}
