import { defaultModelConfig, getProjectDb } from '../db/projectDb'
import type {
  AcquiredViaRecord,
  ChannelMetricsRecord,
  ChannelRecord,
  ChannelSpendDailyRecord,
  ComputeJobPayload,
  CustomerMetricsRecord,
  CustomerRecord,
  EventRecord,
  ModelConfigRecord,
  SegmentKey,
  SegmentMetricsRecord,
  TransactionRecord,
} from '../db/types'

interface ComputeHooks {
  onProgress?: (phase: string) => void | Promise<void>
}

export async function runComputePipeline(
  payload: ComputeJobPayload,
  hooks?: ComputeHooks,
): Promise<{ customerCount: number; channelCount: number }> {
  const db = getProjectDb(payload.projectId)
  const config = (await db.modelConfig.get('active')) ?? defaultModelConfig()
  const startedAt = new Date().toISOString()
  await db.jobs.put({
    jobId: payload.jobId,
    type: 'compute',
    status: 'RUNNING',
    processedRows: 0,
    phase: 'loading data',
    startedAt,
    updatedAt: startedAt,
  })

  const [customers, transactions, events, channels, acquiredVia, spendDaily] = await Promise.all([
    db.customers.toArray(),
    db.transactions.toArray(),
    db.events.toArray(),
    db.channels.toArray(),
    db.acquiredVia.toArray(),
    db.channelSpendDaily.toArray(),
  ])

  await noteProgress('computing customer metrics')

  const churnDates = buildChurnMap(events, config)
  const totals = computeCustomerTotals(customers, transactions, churnDates, config)
  const segments = assignSegments(totals, config)
  const customerMetrics = buildCustomerMetrics(totals, segments)

  await noteProgress('computing channel metrics')

  const channelMetrics = computeChannelMetrics(
    customerMetrics,
    customers,
    channels,
    acquiredVia,
    spendDaily,
    config,
  )
  const segmentMetrics = summarizeSegments(customerMetrics)

  await noteProgress('writing materialized tables')

  await db.transaction('rw', db.customerMetrics, db.segmentMetrics, db.channelMetrics, async () => {
    await db.customerMetrics.clear()
    await db.segmentMetrics.clear()
    await db.channelMetrics.clear()
    if (customerMetrics.length) await db.customerMetrics.bulkAdd(customerMetrics)
    if (segmentMetrics.length) await db.segmentMetrics.bulkAdd(segmentMetrics)
    if (channelMetrics.length) await db.channelMetrics.bulkAdd(channelMetrics)
  })

  await db.jobs.update(payload.jobId, {
    status: 'COMPLETED',
    processedRows: customerMetrics.length,
    phase: 'done',
    updatedAt: new Date().toISOString(),
  })
  await db.auditLog.add({
    ts: new Date().toISOString(),
    type: 'RECOMPUTE',
    projectId: payload.projectId,
    userLabel: 'local-user',
    payload: {
      customers: customerMetrics.length,
      channels: channelMetrics.length,
    },
  })

  return { customerCount: customerMetrics.length, channelCount: channelMetrics.length }

  async function noteProgress(phase: string) {
    await db.jobs.update(payload.jobId, {
      phase,
      updatedAt: new Date().toISOString(),
    })
    if (hooks?.onProgress) {
      await hooks.onProgress(phase)
    }
  }
}

function buildChurnMap(events: EventRecord[], config: ModelConfigRecord) {
  const churnDates = new Map<string, number>()
  events.forEach((event) => {
    if (!config.churnEventTypes.includes(event.type)) return
    const ts = new Date(event.date).getTime()
    const current = churnDates.get(event.customerId)
    if (!current || ts < current) {
      churnDates.set(event.customerId, ts)
    }
  })
  return churnDates
}

interface CustomerAggregate {
  ltv: number
  txnCount: number
  first?: string
  last?: string
}

function computeCustomerTotals(
  customers: CustomerRecord[],
  transactions: TransactionRecord[],
  churnDates: Map<string, number>,
  config: ModelConfigRecord,
) {
  const totals = new Map<string, CustomerAggregate>()
  const acquisitionLookup = new Map<string, number>()
  customers.forEach((customer) => {
    const ts = customer.acquisitionDate ? new Date(customer.acquisitionDate).getTime() : undefined
    if (ts) acquisitionLookup.set(customer.customerId, ts)
    totals.set(customer.customerId, { ltv: 0, txnCount: 0 })
  })

  const windowMs = config.ltvWindowDays ? config.ltvWindowDays * 24 * 60 * 60 * 1000 : null

  transactions.forEach((txn) => {
    const churnTs = churnDates.get(txn.customerId)
    const txnTs = new Date(txn.date).getTime()
    if (churnTs && txnTs > churnTs) return
    const acquisitionTs = acquisitionLookup.get(txn.customerId)
    if (windowMs && acquisitionTs && txnTs > acquisitionTs + windowMs) return

    const entry = totals.get(txn.customerId) ?? { ltv: 0, txnCount: 0 }
    entry.ltv += txn.revenueAmount
    entry.txnCount += 1
    entry.first = !entry.first || txn.date < entry.first ? txn.date : entry.first
    entry.last = !entry.last || txn.date > entry.last ? txn.date : entry.last
    totals.set(txn.customerId, entry)
  })

  return totals
}

function assignSegments(
  totals: Map<string, CustomerAggregate>,
  config: ModelConfigRecord,
): Map<string, SegmentKey> {
  const ltvs = Array.from(totals.values())
    .map((entry) => entry.ltv)
    .sort((a, b) => a - b)
  const highIdx = Math.floor(Math.max(ltvs.length - 1, 0) * (config.segmentHighQuantile ?? 0.9))
  const midIdx = Math.floor(Math.max(ltvs.length - 1, 0) * (config.segmentMidQuantile ?? 0.7))
  const highThreshold = ltvs[highIdx] ?? 0
  const midThreshold = ltvs[midIdx] ?? 0
  const segments = new Map<string, SegmentKey>()
  totals.forEach((entry, customerId) => {
    if (ltvs.length === 0) {
      segments.set(customerId, 'LOW')
    } else if (entry.ltv >= highThreshold) {
      segments.set(customerId, 'HIGH')
    } else if (entry.ltv >= midThreshold) {
      segments.set(customerId, 'MID')
    } else {
      segments.set(customerId, 'LOW')
    }
  })
  return segments
}

function buildCustomerMetrics(
  totals: Map<string, CustomerAggregate>,
  segments: Map<string, SegmentKey>,
): CustomerMetricsRecord[] {
  const computedAt = new Date().toISOString()
  return Array.from(totals.entries()).map(([customerId, entry]) => ({
    customerId,
    ltv: entry.ltv,
    txnCount: entry.txnCount,
    firstPurchaseDate: entry.first,
    lastPurchaseDate: entry.last,
    ltvSegment: segments.get(customerId) ?? 'LOW',
    computedAt,
    modelVersion: 1,
  }))
}

function summarizeSegments(customerMetrics: CustomerMetricsRecord[]): SegmentMetricsRecord[] {
  const map = new Map<SegmentKey, { count: number; revenue: number }>()
  customerMetrics.forEach((metric) => {
    const entry = map.get(metric.ltvSegment) ?? { count: 0, revenue: 0 }
    entry.count += 1
    entry.revenue += metric.ltv
    map.set(metric.ltvSegment, entry)
  })
  const computedAt = new Date().toISOString()
  return ['HIGH', 'MID', 'LOW'].map((key) => {
    const segmentKey = key as SegmentKey
    const entry = map.get(segmentKey) ?? { count: 0, revenue: 0 }
    return {
      segmentKey,
      customerCount: entry.count,
      avgLtv: entry.count ? entry.revenue / entry.count : 0,
      totalRevenue: entry.revenue,
      highChannelCount: 0,
      computedAt,
      modelVersion: 1,
    }
  })
}

function computeChannelMetrics(
  customerMetrics: CustomerMetricsRecord[],
  customers: CustomerRecord[],
  channels: ChannelRecord[],
  acquiredVia: AcquiredViaRecord[],
  spendDaily: ChannelSpendDailyRecord[],
  config: ModelConfigRecord,
): ChannelMetricsRecord[] {
  const customerChannel = new Map<string, string>()

  if (config.attributionMode === 'acquired_via' && acquiredVia.length) {
    acquiredVia.forEach((edge) => {
      if (!customerChannel.has(edge.customerId)) {
        customerChannel.set(edge.customerId, edge.channelId)
      }
    })
  } else {
    customers.forEach((customer) => {
      if (customer.channelSourceId) {
        customerChannel.set(customer.customerId, customer.channelSourceId)
      }
    })
    if (!customerChannel.size && acquiredVia.length) {
      acquiredVia.forEach((edge) => {
        if (!customerChannel.has(edge.customerId)) {
          customerChannel.set(edge.customerId, edge.channelId)
        }
      })
    }
  }

  const spendByChannel = new Map<string, number>()
  if (config.cacSpendSource === 'daily' && spendDaily.length) {
    const cutoff = config.cacLookbackDays
      ? Date.now() - config.cacLookbackDays * 24 * 60 * 60 * 1000
      : null
    spendDaily.forEach((row) => {
      const ts = new Date(row.date).getTime()
      if (cutoff && ts < cutoff) return
      spendByChannel.set(row.channelId, (spendByChannel.get(row.channelId) ?? 0) + row.spend)
    })
  } else {
    channels.forEach((channel) => {
      if (channel.budgetSpend !== undefined) {
        spendByChannel.set(channel.channelId, channel.budgetSpend)
      }
    })
  }

  channels.forEach((channel) => {
    if (!spendByChannel.has(channel.channelId)) {
      spendByChannel.set(channel.channelId, 0)
    }
  })

  const aggregates = new Map<string, { customers: number; high: number; totalLtv: number }>()
  customerMetrics.forEach((metric) => {
    const channelId = customerChannel.get(metric.customerId)
    if (!channelId) return
    const entry = aggregates.get(channelId) ?? { customers: 0, high: 0, totalLtv: 0 }
    entry.customers += 1
    if (metric.ltvSegment === 'HIGH') entry.high += 1
    entry.totalLtv += metric.ltv
    aggregates.set(channelId, entry)
  })

  const computedAt = new Date().toISOString()
  return Array.from(aggregates.entries()).map(([channelId, entry]) => {
    const spend = spendByChannel.get(channelId) ?? 0
    const cac = entry.customers ? spend / entry.customers : 0
    const avgLtv = entry.customers ? entry.totalLtv / entry.customers : 0
    return {
      channelId,
      cac,
      spend,
      acquiredCustomers: entry.customers,
      highLtvCustomers: entry.high,
      highLtvShare: entry.customers ? entry.high / entry.customers : 0,
      netValue: avgLtv - cac,
      avgLtv,
      computedAt,
      modelVersion: 1,
    }
  })
}
