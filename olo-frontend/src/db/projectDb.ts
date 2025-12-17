import Dexie from 'dexie'
import type { Table } from 'dexie'
import type {
  AcquiredViaRecord,
  ActionPlanRecord,
  AuditLogRecord,
  ChannelMetricsRecord,
  ChannelRecord,
  ChannelSpendDailyRecord,
  CustomerMetricsRecord,
  CustomerRecord,
  EventRecord,
  ImportMappingRecord,
  JobRecord,
  ModelConfigRecord,
  SegmentMetricsRecord,
  TransactionRecord,
} from './types'

export const PROJECT_SCHEMA_VERSION = 1
export const PROJECT_DB_PREFIX = 'olo_project_'

export const defaultModelConfig = (
  currency = 'USD',
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
): ModelConfigRecord => ({
  key: 'active',
  ltvWindowDays: null,
  churnEventTypes: [],
  segmentHighQuantile: 0.9,
  segmentMidQuantile: 0.7,
  attributionMode: 'channel_field',
  cacSpendSource: 'daily',
  defaultCurrency: currency,
  timezone,
  cacLookbackDays: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

export class ProjectDatabase extends Dexie {
  customers!: Table<CustomerRecord, string>
  transactions!: Table<TransactionRecord, string>
  channels!: Table<ChannelRecord, string>
  events!: Table<EventRecord, string>
  acquiredVia!: Table<AcquiredViaRecord, [string, string]>
  channelSpendDaily!: Table<ChannelSpendDailyRecord, [string, string]>
  customerMetrics!: Table<CustomerMetricsRecord, string>
  channelMetrics!: Table<ChannelMetricsRecord, string>
  segmentMetrics!: Table<SegmentMetricsRecord, string>
  modelConfig!: Table<ModelConfigRecord, string>
  importMappings!: Table<ImportMappingRecord, number>
  auditLog!: Table<AuditLogRecord, number>
  jobs!: Table<JobRecord, string>
  actionPlans!: Table<ActionPlanRecord, string>

  constructor(name: string) {
    super(name)
    this.version(PROJECT_SCHEMA_VERSION).stores({
      customers: 'customerId, channelSourceId, acquisitionDate',
      transactions: 'transactionId, customerId, date, [customerId+date]',
      channels: 'channelId, name',
      events: 'eventId, customerId, type, [customerId+date]',
      acquiredVia: '[customerId+channelId], customerId, channelId',
      channelSpendDaily: '[channelId+date], channelId, date',
      customerMetrics: 'customerId, ltvSegment',
      channelMetrics: 'channelId',
      segmentMetrics: 'segmentKey',
      modelConfig: 'key',
      importMappings: '++id, dataset',
      auditLog: '++id, type, ts',
      jobs: 'jobId, type, status, updatedAt',
      actionPlans: 'planId, createdAt',
    })
  }
}

const projectDbCache = new Map<string, ProjectDatabase>()

export function getProjectDb(projectId: string) {
  if (!projectDbCache.has(projectId)) {
    const db = new ProjectDatabase(`${PROJECT_DB_PREFIX}${projectId}`)
    projectDbCache.set(projectId, db)
  }

  return projectDbCache.get(projectId)!
}

export async function initializeProjectDb(
  projectId: string,
  overrides?: Partial<Pick<ModelConfigRecord, 'defaultCurrency' | 'timezone'>>,
) {
  const db = getProjectDb(projectId)
  await db.open()
  const existing = await db.modelConfig.get('active')
  if (!existing) {
    await db.modelConfig.put(
      defaultModelConfig(overrides?.defaultCurrency, overrides?.timezone),
    )
  }
}

export async function deleteProjectDb(projectId: string) {
  const dbName = `${PROJECT_DB_PREFIX}${projectId}`
  if (projectDbCache.has(projectId)) {
    projectDbCache.get(projectId)!.close()
    projectDbCache.delete(projectId)
  }
  await Dexie.delete(dbName)
}
