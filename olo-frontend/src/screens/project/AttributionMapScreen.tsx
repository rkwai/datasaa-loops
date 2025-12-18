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
  const channelMetrics = useMemo(
    () => liveChannelMetrics ?? [],
    [liveChannelMetrics],
  )
  const customers = useMemo(() => liveCustomers ?? [], [liveCustomers])
  const customerMetrics = useMemo(
    () => liveCustomerMetrics ?? [],
    [liveCustomerMetrics],
  )
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
  const maxCount = edges.reduce((max, edge) => Math.max(max, edge.count), 0)
  const width = 900
  const rowHeight = 60
  const height = Math.max(channels.length, 3) * rowHeight + 80

  const channelPositions = new Map<string, number>()
  channels.forEach((channelId, index) => {
    channelPositions.set(channelId, 40 + index * rowHeight)
  })

  const segmentPositions: Record<SegmentKey, number> = {
    HIGH: 40,
    MID: 40 + rowHeight,
    LOW: 40 + rowHeight * 2,
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dynamic CAC attribution map</h1>
          <p className="page-description">
            Explore first-touch links between acquisition sources and LTV segments. Thicker beams
            indicate more customers, color indicates segment, and the detail panel shows the resulting LTV:CAC ratio.
          </p>
        </div>
      </div>

      <section className="dimming-card" style={{ overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="chip-row">
            {(['HIGH', 'MID', 'LOW'] as SegmentKey[]).map((segment) => (
              <span key={segment} className="chip" style={{ background: SEGMENT_COLORS[segment], color: '#fff' }}>
                {segment}
              </span>
            ))}
          </div>
          <span className="page-description">Click an edge to inspect CAC vs LTV delta.</span>
        </div>
        <svg width={width} height={height} style={{ maxWidth: '100%' }}>
          {channels.map((channelId) => (
            <g key={channelId}>
              <text x={20} y={(channelPositions.get(channelId) ?? 0) + 5} fill="#0f172a">
                {channelId}
              </text>
              <circle cx={5} cy={channelPositions.get(channelId) ?? 0} r={6} fill="#1d4ed8" />
            </g>
          ))}

          {(['HIGH', 'MID', 'LOW'] as SegmentKey[]).map((segment) => (
            <g key={segment}>
              <text x={width - 140} y={(segmentPositions[segment] ?? 0) + 5} fill="#0f172a">
                {segment}
              </text>
              <circle cx={width - 20} cy={segmentPositions[segment] ?? 0} r={8} fill={SEGMENT_COLORS[segment]} />
            </g>
          ))}

          {edges.map((edge) => {
            const y1 = channelPositions.get(edge.channelId) ?? 0
            const y2 = segmentPositions[edge.segment]
            const strokeWidth = maxCount ? Math.max(2, (edge.count / maxCount) * 16) : 2
            return (
              <line
                key={`${edge.channelId}-${edge.segment}`}
                x1={20}
                y1={y1}
                x2={width - 40}
                y2={y2}
                stroke={SEGMENT_COLORS[edge.segment]}
                strokeWidth={strokeWidth}
                opacity={0.75}
                onClick={() => setSelectedEdge(edge)}
                style={{ cursor: 'pointer' }}
                role="button"
                tabIndex={0}
                aria-label={`${edge.channelId} to ${edge.segment}`}
                data-testid={`edge-${edge.channelId}-${edge.segment}`}
              />
            )
          })}
        </svg>
        {!edges.length && <p>No channels with acquisitions mapped yet.</p>}
      </section>

      {selectedEdge && (
        <div className="surface" style={{ marginTop: '1.5rem', borderRadius: 28 }} data-testid="edge-detail-panel">
          <h3 style={{ marginTop: 0 }}>
            {selectedEdge.channelId} → {selectedEdge.segment}
          </h3>
          <div className="stat-grid" style={{ marginTop: '1rem' }}>
            <div className="stat-card">
              <h3>Customers</h3>
              <strong>{selectedEdge.count}</strong>
            </div>
            <div className="stat-card">
              <h3>Average LTV</h3>
              <strong>{selectedEdge.avgLtv.toFixed(2)}</strong>
            </div>
            <div className="stat-card">
              <h3>LTV:CAC</h3>
              <strong>
                {(() => {
                  const metric = channelMetrics.find((c) => c.channelId === selectedEdge.channelId)
                  if (!metric || metric.cac === 0) return '—'
                  return (metric.avgLtv / metric.cac).toFixed(2)
                })()}
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
