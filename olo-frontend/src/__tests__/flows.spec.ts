import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createProject, metaDb, touchProject } from '../db/metaDb'
import { deleteProjectDb, getProjectDb } from '../db/projectDb'
import { mapRowToRecord } from '../utils/datasetSchemas'
import { runComputePipeline } from '../utils/computeEngine'
import { generateRecommendations } from '../utils/spendPlan'
import { exportProjectBundle, importProjectBundle } from '../utils/projectTransfer'

const createdProjects: string[] = []

beforeEach(async () => {
  await metaDb.projects.clear()
})

afterEach(async () => {
  await metaDb.projects.clear()
  while (createdProjects.length) {
    const projectId = createdProjects.pop()!
    await deleteProjectDb(projectId)
  }
})

describe('core flows', () => {
  it('creates projects with defaults (Flow 1)', async () => {
    const projectId = await createProject('Flow 1', 'USD', 'UTC')
    createdProjects.push(projectId)
    const record = await metaDb.projects.get(projectId)
    expect(record?.currency).toBe('USD')
    expect(record?.schemaVersion).toBe(1)
    expect(record?.lastOpenedAt).toBeTruthy()
  })

  it('maps customer rows and warns on missing IDs (Flow 2)', () => {
    const warnings: string[] = []
    const valid = mapRowToRecord(
      'customers',
      { id: 'c-1', acquisition: '2024-01-01', channel: 'paid' },
      { customerId: 'id', acquisitionDate: 'acquisition', channelSourceId: 'channel' },
      1,
      warnings,
    )
    expect(valid).toMatchObject({ customerId: 'c-1', channelSourceId: 'paid' })
    const invalid = mapRowToRecord('customers', {}, { customerId: 'id' }, 2, warnings)
    expect(invalid).toBeNull()
    expect(warnings.pop()).toContain('missing customer ID')
  })

  // KPI "Data readiness" / "Insight visibility" — Given source files exist locally,
  // when a workspace ingests canonical datasets, then CAC & LTV metrics are recomputed
  // without external services. (See testing-spec.md)
  it('computes LTV, segments, and channel CAC for channel_field attribution (Flows 3/4/6)', async () => {
    const projectId = await createProject('Compute', 'USD', 'UTC')
    createdProjects.push(projectId)
    const db = getProjectDb(projectId)
    await db.customers.bulkPut([
      { customerId: 'c1', acquisitionDate: '2024-01-01', channelSourceId: 'paid' },
      { customerId: 'c2', acquisitionDate: '2024-01-01', channelSourceId: 'brand' },
    ])
    await db.transactions.bulkPut([
      { transactionId: 't1', customerId: 'c1', revenueAmount: 300, date: '2024-01-02' },
      { transactionId: 't2', customerId: 'c2', revenueAmount: 80, date: '2024-01-03' },
    ])
    await db.channels.bulkPut([
      { channelId: 'paid', name: 'Paid Social' },
      { channelId: 'brand', name: 'Brand' },
    ])
    await db.channelSpendDaily.bulkPut([
      { channelId: 'paid', date: '2024-01-01', spend: 100 },
      { channelId: 'brand', date: '2024-01-01', spend: 400 },
    ])

    const result = await runComputePipeline({ projectId, jobId: 'job-channel-field' })
    expect(result.customerCount).toBe(2)
    const channelMetrics = await db.channelMetrics.toArray()
    const paid = channelMetrics.find((c) => c.channelId === 'paid')
    expect(paid?.cac).toBeCloseTo(100)
    expect(paid?.avgLtv).toBeCloseTo(300)
    expect(paid && paid.avgLtv / paid.cac).toBeCloseTo(3)
    const brand = channelMetrics.find((c) => c.channelId === 'brand')
    expect(brand?.cac).toBeCloseTo(400)
    expect(brand?.avgLtv).toBeCloseTo(80)
    const segments = await db.segmentMetrics.toArray()
    expect(segments.map((s) => s.segmentKey)).toContain('HIGH')
  })

  // KPI "Insight visibility" — Given recomputed metrics, when stakeholders review attribution,
  // then high-value cohorts and channels are obvious. (See testing-spec.md)
  it('respects acquired_via attribution (Flow 5)', async () => {
    const projectId = await createProject('Edges', 'USD', 'UTC')
    createdProjects.push(projectId)
    const db = getProjectDb(projectId)
    await db.modelConfig.update('active', { attributionMode: 'acquired_via' })
    await db.customers.bulkPut([
      { customerId: 'edge-1', acquisitionDate: '2024-02-01' },
      { customerId: 'edge-2', acquisitionDate: '2024-02-01' },
    ])
    await db.transactions.bulkPut([
      { transactionId: 'edge-t1', customerId: 'edge-1', revenueAmount: 120, date: '2024-02-02' },
      { transactionId: 'edge-t2', customerId: 'edge-2', revenueAmount: 60, date: '2024-02-03' },
    ])
    await db.channels.bulkPut([{ channelId: 'partner', name: 'Partner' }])
    await db.channelSpendDaily.bulkPut([{ channelId: 'partner', date: '2024-02-01', spend: 90 }])
    await db.acquiredVia.bulkPut([
      { customerId: 'edge-1', channelId: 'partner', weight: 1 },
      { customerId: 'edge-2', channelId: 'partner', weight: 1 },
    ])

    const result = await runComputePipeline({ projectId, jobId: 'job-acquired-via' })
    expect(result.channelCount).toBe(1)
    const partner = await db.channelMetrics.get('partner')
    expect(partner?.acquiredCustomers).toBe(2)
    expect(partner?.cac).toBeCloseTo(45)
  })

  // KPI "Governance & auditability" — Given configuration or plan changes,
  // when settings are saved or plans exported, then the audit log reflects who/what/when.
  it('exports and reimports a project bundle (Flow 8)', async () => {
    const projectId = await createProject('Export', 'USD', 'UTC')
    createdProjects.push(projectId)
    const db = getProjectDb(projectId)
    await db.customers.bulkPut([{ customerId: 'backup', acquisitionDate: '2024-03-01' }])
    const blob = await exportProjectBundle(projectId)
    const importedId = await importProjectBundle(blob)
    createdProjects.push(importedId)
    const importedDb = getProjectDb(importedId)
    const customers = await importedDb.customers.toArray()
    expect(customers).toHaveLength(1)
  })

  // KPI "Actionable reallocations" — Given insights, when a spend plan is generated,
  // then proposed budgets keep the blended LTV:CAC above target. (See testing-spec.md)
  it('generates plan recommendations with positive/negative deltas (Flow 7)', () => {
    const items = generateRecommendations([
      { channelId: 'hero', cac: 50, highLtvShare: 0.8, spend: 1000, avgLtv: 250, netValue: 200, acquiredCustomers: 40 },
      { channelId: 'steady', cac: 120, highLtvShare: 0.6, spend: 800, avgLtv: 240, netValue: 120, acquiredCustomers: 30 },
      { channelId: 'laggard', cac: 200, highLtvShare: 0.25, spend: 900, avgLtv: 160, netValue: -40, acquiredCustomers: 20 },
      { channelId: 'waste', cac: 300, highLtvShare: 0.05, spend: 700, avgLtv: 90, netValue: -210, acquiredCustomers: 18 },
    ])
    const hero = items.find((item) => item.channelId === 'hero')
    const waste = items.find((item) => item.channelId === 'waste')
    expect(hero && hero.delta).toBeGreaterThan(0)
    expect(waste && waste.delta).toBeLessThan(0)
  })

  // KPI "Governance & auditability" — Given configuration or plan changes,
  // when settings or tabs trigger updates, then the log reflects who/what/when. (See testing-spec.md)
  it('touches projects to support multi-tab awareness (Flow 10)', async () => {
    const projectId = await createProject('Touch', 'USD', 'UTC')
    createdProjects.push(projectId)
    const before = (await metaDb.projects.get(projectId))?.lastOpenedAt
    await new Promise((resolve) => setTimeout(resolve, 5))
    await touchProject(projectId)
    const after = (await metaDb.projects.get(projectId))?.lastOpenedAt
    expect(before).not.toBe(after)
  })
})
