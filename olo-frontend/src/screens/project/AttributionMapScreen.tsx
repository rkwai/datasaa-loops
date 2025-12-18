import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useProjectContext } from '../../context/useProjectContext'
import type { SegmentKey } from '../../db/types'

const SEGMENT_COLORS: Record<SegmentKey, string> = {
  HIGH: '#00d68f',
  MID: '#f97316',
  LOW: '#94a3b8',
}

interface EdgeInfo {
  channelId: string
  segment: SegmentKey
  count: number
  avgLtv: number
}

export function AttributionMapScreen() {
  const { db } = useProjectContext()
  const liveChannelMetrics = useLiveQuery(() => db.channelMetrics.toArray(), [db])
  const liveCustomers = useLiveQuery(() => db.customers.toArray(), [db])
  const liveCustomerMetrics = useLiveQuery(() => db.customerMetrics.toArray(), [db])

  const channelMetrics = useMemo(() => liveChannelMetrics ?? [], [liveChannelMetrics])
  const customers = useMemo(() => liveCustomers ?? [], [liveCustomers])
  const customerMetrics = useMemo(() => liveCustomerMetrics ?? [], [liveCustomerMetrics])
  const [selectedEdge, setSelectedEdge] = useState<EdgeInfo | null>(null)

  const edges = useMemo(() => {
    if (!customers.length) return []
    const metricMap = new Map(customerMetrics.map((metric) => [metric.customerId, metric]))
    const grouped = new Map<string, Map<SegmentKey, { count: number; totalLtv: number }>>()
    customers.forEach((customer) => {
      if (!customer.channelSourceId) return
      const metric = metricMap.get(customer.customerId)
      if (!metric) return
      const channelGroup = grouped.get(customer.channelSourceId) ?? new Map()
      const segmentEntry = channelGroup.get(metric.ltvSegment) ?? { count: 0, totalLtv: 0 }
      segmentEntry.count += 1
      segmentEntry.totalLtv += metric.ltv
      channelGroup.set(metric.ltvSegment, segmentEntry)
      grouped.set(customer.channelSourceId, channelGroup)
    })
    const channelOrder = channelMetrics.map((metric) => metric.channelId)
    const rows: EdgeInfo[] = []
    grouped.forEach((segmentMap, channelId) => {
      segmentMap.forEach((entry, segmentKey) => {
        rows.push({
          channelId,
          segment: segmentKey,
          count: entry.count,
          avgLtv: entry.totalLtv / (entry.count || 1),
        })
      })
    })
    return rows.sort((a, b) => channelOrder.indexOf(a.channelId) - channelOrder.indexOf(b.channelId))
  }, [customers, customerMetrics, channelMetrics])

  const fallbackChannels = Array.from(
    new Set(customers.map((customer) => customer.channelSourceId).filter(Boolean)),
  ) as string[]
  const channels = channelMetrics.length ? channelMetrics.map((metric) => metric.channelId) : fallbackChannels
  const segments: SegmentKey[] = ['HIGH', 'MID', 'LOW']
  const maxCount = edges.reduce((max, edge) => Math.max(max, edge.count), 0)

  const totalSpend = channelMetrics.reduce((sum, channel) => sum + channel.spend, 0)
  const totalAcquired = channelMetrics.reduce((sum, channel) => sum + channel.acquiredCustomers, 0)
  const blendedCac = totalAcquired ? totalSpend / totalAcquired : 0
  const totalRevenue = customerMetrics.reduce((sum, metric) => sum + metric.ltv, 0)
  const avgLtv = customerMetrics.length ? totalRevenue / customerMetrics.length : 0

  const width = 900
  const rowHeight = 80
  const height = Math.max(channels.length, segments.length) * rowHeight + 120

  const channelPositions = new Map<string, number>()
  channels.forEach((channelId, index) => {
    channelPositions.set(channelId, 100 + index * rowHeight)
  })

  const segmentPositions = new Map<SegmentKey, number>()
  segments.forEach((segment, index) => {
    segmentPositions.set(segment, 100 + index * rowHeight)
  })

  function handleEdgeSelect(edge: EdgeInfo) {
    setSelectedEdge(edge)
  }

  return (
    <div className="attribution-shell">
      <section className="attribution-hero">
        <div>
          <span className="dashboard-chip">The Methodology</span>
          <h1 data-testid="attribution-title">Dynamic CAC attribution map</h1>
          <p>
            Visualize your growth loop, spot leaks, and identify which channels are consistently creating high-value
            segments. Click a beam to inspect its payback math.
          </p>
        </div>
        <div className="attribution-hero-actions">
          <button type="button" className="dashboard-filter">
            Oct 1 – Oct 31 <span>▾</span>
          </button>
          <button type="button" className="accent-button">
            <span className="material-symbols-outlined">download</span>
            Export report
          </button>
        </div>
      </section>

      <section className="dashboard-kpis">
        <article className="dashboard-kpi-card tone-neutral">
          <div className="kpi-icon">
            <span className="material-symbols-outlined">payments</span>
          </div>
          <p className="kpi-label">Total spend</p>
          <strong className="kpi-value">${totalSpend.toFixed(0)}</strong>
          <span className="kpi-change">Tracked across channels</span>
        </article>
        <article className="dashboard-kpi-card tone-neutral">
          <div className="kpi-icon">
            <span className="material-symbols-outlined">group_add</span>
          </div>
          <p className="kpi-label">Blended CAC</p>
          <strong className="kpi-value">${blendedCac.toFixed(2)}</strong>
          <span className="kpi-change">Spend ÷ acquisitions</span>
        </article>
        <article className="dashboard-kpi-card tone-positive">
          <div className="kpi-icon">
            <span className="material-symbols-outlined">monetization_on</span>
          </div>
          <p className="kpi-label">Avg LTV</p>
          <strong className="kpi-value">${avgLtv.toFixed(0)}</strong>
          <span className="kpi-change">Customer lifetime value</span>
        </article>
      </section>

      <div className="attribution-content">
        <aside className="attribution-config">
          <div className="panel-title">
            <span className="material-symbols-outlined">tune</span>
            Configuration
          </div>
          <div className="attribution-config-section">
            <label>Attribution model</label>
            <div className="pill-toggle">
              <button type="button" className="active">
                First touch
              </button>
              <button type="button">Last touch</button>
              <button type="button">Linear</button>
            </div>
          </div>
          <div className="attribution-config-section">
            <label>Minimum volume</label>
            <input type="range" min="0" max="1000" defaultValue="100" />
            <span className="range-value">≥100 users</span>
          </div>
          <div className="attribution-config-section">
            <label>Legend</label>
            <div className="legend-row">
              <span className="legend-dot high" />
              <span>High LTV connection</span>
            </div>
            <div className="legend-row">
              <span className="legend-dot standard" />
              <span>Standard volume</span>
            </div>
          </div>
        </aside>

        <section className="attribution-graph-panel">
          <div className="graph-header">
            <div>
              <span className="material-symbols-outlined">timeline</span>
              Visualizing {channels.length} channels → {segments.length} segments
            </div>
            <div className="graph-controls">
              <button type="button">
                <span className="material-symbols-outlined">zoom_in</span>
              </button>
              <button type="button">
                <span className="material-symbols-outlined">zoom_out</span>
              </button>
              <button type="button">
                <span className="material-symbols-outlined">fullscreen</span>
              </button>
            </div>
          </div>

          <div className="attribution-graph">
            <svg width={width} height={height} role="presentation">
              <defs>
                <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#00d68f" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#00d68f" stopOpacity="0.3" />
                </linearGradient>
              </defs>
              {edges.map((edge) => {
                const y1 = channelPositions.get(edge.channelId) ?? 0
                const y2 = segmentPositions.get(edge.segment) ?? 0
                const strokeWidth = maxCount ? Math.max(2, (edge.count / maxCount) * 18) : 2
                return (
                  <line
                    key={`${edge.channelId}-${edge.segment}`}
                    x1={120}
                    y1={y1}
                    x2={width - 140}
                    y2={y2}
                    stroke={SEGMENT_COLORS[edge.segment]}
                    strokeWidth={strokeWidth}
                    opacity={0.75}
                    className="flow-line"
                    data-testid={`edge-${edge.channelId}-${edge.segment}`}
                    onClick={() => handleEdgeSelect(edge)}
                  />
                )
              })}
            </svg>

            <div className="node-column left">
              {channels.map((channelId) => (
                <button
                  key={channelId}
                  type="button"
                  className="channel-node"
                  style={{ top: `${((channelPositions.get(channelId) ?? 0) / height) * 100}%` }}
                >
                  <span className="material-symbols-outlined">podcasts</span>
                  <div>
                    <strong>{channelId}</strong>
                    <span>
                      CAC $
                      {channelMetrics
                        .find((metric) => metric.channelId === channelId)
                        ?.cac.toFixed(0) ?? '—'}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="node-column right">
              {segments.map((segment) => (
                <div
                  key={segment}
                  className="segment-node"
                  style={{ top: `${((segmentPositions.get(segment) ?? 0) / height) * 100}%` }}
                >
                  <span className="material-symbols-outlined">group_work</span>
                  <div>
                    <strong>{segment}</strong>
                    <span>
                      LTV $
                      {customerMetrics.length
                        ? (
                            customerMetrics
                              .filter((metric) => metric.ltvSegment === segment)
                              .reduce((sum, metric) => sum + metric.ltv, 0) /
                            (customerMetrics.filter((metric) => metric.ltvSegment === segment).length || 1)
                          ).toFixed(0)
                        : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {selectedEdge && (
              <div className="edge-detail-card" data-testid="edge-detail-panel">
                <header>
                  <span>Connection</span>
                  <span className="pill">Top path</span>
                </header>
                <dl>
                  <div>
                    <dt>Volume</dt>
                    <dd>{selectedEdge.count.toLocaleString()} users</dd>
                  </div>
                  <div>
                    <dt>Avg LTV</dt>
                    <dd>
                      $
                      {selectedEdge.avgLtv.toFixed(0)}
                    </dd>
                  </div>
                  <div>
                    <dt>LTV:CAC</dt>
                    <dd>
                      {(() => {
                        const metric = channelMetrics.find((c) => c.channelId === selectedEdge.channelId)
                        if (!metric || metric.cac === 0) return '—'
                        return (metric.avgLtv / metric.cac).toFixed(2)
                      })()}
                    </dd>
                  </div>
                </dl>
                <footer>
                  <span>Net value proxy</span>
                  <span>85%</span>
                  <div className="progress">
                    <div style={{ width: '85%' }} />
                  </div>
                </footer>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
