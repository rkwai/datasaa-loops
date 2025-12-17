import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useProjectContext } from '../../context/ProjectContext'
import type { SegmentKey } from '../../db/types'
import { nanoid } from 'nanoid'
import { runComputeJob } from '../../utils/workers'

export function SegmentDashboard() {
  const { db, meta, projectId } = useProjectContext()
  const segmentMetrics = useLiveQuery(() => db.segmentMetrics.toArray(), [db]) ?? []
  const channelMetrics = useLiveQuery(() => db.channelMetrics.toArray(), [db]) ?? []
  const totalCustomers = segmentMetrics.reduce((sum, seg) => sum + seg.customerCount, 0)
  const totalRevenue = segmentMetrics.reduce((sum, seg) => sum + seg.totalRevenue, 0)
  const avgLtv = totalCustomers ? totalRevenue / totalCustomers : 0
  const topSegment = [...segmentMetrics].sort((a, b) => b.avgLtv - a.avgLtv)[0]
  const [selectedSegment, setSelectedSegment] = useState<SegmentKey | 'ALL'>('ALL')
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null)

  const drilldownCustomers = useLiveQuery(async () => {
    if (!selectedSegment || selectedSegment === 'ALL') return []
    return db.customerMetrics.where('ltvSegment').equals(selectedSegment).limit(50).toArray()
  }, [db, selectedSegment])

  const channelCustomers = useLiveQuery(async () => {
    if (!selectedChannel) return []
    let customers = await db.customers
      .where('channelSourceId')
      .equals(selectedChannel)
      .limit(50)
      .toArray()
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Segment identification</h1>
          <p className="page-description">
            Watch LTV distribution shift as you re-import, and spotlight the channels that reliably
            create high-value customers.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
          <button type="button" onClick={handleRecompute}>
            Recompute now
          </button>
          {recomputeStatus && <span className="page-description">{recomputeStatus}</span>}
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg,#e0f7ff,#fff)' }}>
          <h3>Total customers</h3>
          <strong>{totalCustomers.toLocaleString()}</strong>
        </div>
        <div className="stat-card">
          <h3>Total revenue</h3>
          <strong>
            {totalRevenue.toLocaleString(undefined, {
              style: 'currency',
              currency: meta.currency,
              maximumFractionDigits: 0,
            })}
          </strong>
        </div>
        <div className="stat-card">
          <h3>Average LTV</h3>
          <strong>{avgLtv.toFixed(0)}</strong>
        </div>
        <div className="stat-card">
          <h3>Top segment</h3>
          <strong>{topSegment ? topSegment.segmentKey : 'N/A'}</strong>
          <span className="page-description">
            {topSegment ? `${Math.round(topSegment.avgLtv)} avg LTV` : 'Import data to begin'}
          </span>
        </div>
      </div>

      <div className="split">
        <div className="surface">
          <div className="page-header" style={{ marginBottom: '0.75rem' }}>
            <h3 className="section-title">Segment breakdown</h3>
            <button className="ghost" type="button" onClick={() => setSelectedSegment('ALL')}>
              Reset
            </button>
          </div>
          <p className="page-description">Click a segment to drill into customer-level context.</p>
          <table className="table" style={{ marginTop: '1rem' }}>
            <thead>
              <tr>
                <th>Segment</th>
                <th>Customers</th>
                <th>Avg LTV</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {segmentMetrics.map((segment) => (
                <tr key={segment.segmentKey}>
                  <td>
                    <button
                      className={selectedSegment === segment.segmentKey ? '' : 'secondary'}
                      type="button"
                      onClick={() => setSelectedSegment(segment.segmentKey)}
                    >
                      {segment.segmentKey}
                    </button>
                  </td>
                  <td>{segment.customerCount.toLocaleString()}</td>
                  <td>{segment.avgLtv.toFixed(0)}</td>
                  <td>{segment.totalRevenue.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="surface">
          <div className="page-header" style={{ marginBottom: '0.75rem' }}>
            <h3 className="section-title">Channel performance</h3>
            <button className="ghost" type="button" onClick={() => setSelectedChannel(null)}>
              Reset
            </button>
          </div>
          <p className="page-description">Identify which acquisition sources skew HIGH.</p>
          <div className="table-card" style={{ marginTop: '1rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>CAC</th>
                  <th>Acquired</th>
                  <th>High-LTV share</th>
                </tr>
              </thead>
              <tbody>
                {channelMetrics.map((channel) => (
                  <tr key={channel.channelId}>
                    <td>
                      <button
                        className={selectedChannel === channel.channelId ? '' : 'secondary'}
                        type="button"
                        onClick={() => setSelectedChannel(channel.channelId)}
                      >
                        {channel.channelId}
                      </button>
                    </td>
                    <td>{channel.cac.toFixed(2)}</td>
                    <td>{channel.acquiredCustomers}</td>
                    <td>{(channel.highLtvShare * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="split" style={{ marginTop: '2rem' }}>
        <div className="dimming-card">
          <div className="page-header" style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Segment drilldown ({selectedSegment})</h3>
          </div>
          {selectedSegment === 'ALL' && <p className="page-description">Select a segment above to inspect customers.</p>}
          {selectedSegment !== 'ALL' && !drilldownCustomers && <p>Loading...</p>}
          {selectedSegment !== 'ALL' && drilldownCustomers && drilldownCustomers.length === 0 && (
            <p>No customers yet.</p>
          )}
          {selectedSegment !== 'ALL' && drilldownCustomers && drilldownCustomers.length > 0 && (
            <div className="table-card">
              <table className="table">
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
        </div>
        <div className="dimming-card">
          <div className="page-header" style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Channel drilldown ({selectedChannel ?? 'pick channel'})</h3>
          </div>
          {!selectedChannel && <p className="page-description">Tap a channel tile to populate this view.</p>}
          {selectedChannel && channelCustomers && channelCustomers.length === 0 && <p>No linked customers yet.</p>}
          {selectedChannel && channelCustomers && channelCustomers.length > 0 && (
            <div className="table-card">
              <table className="table">
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
        </div>
      </div>
    </div>
  )
}
