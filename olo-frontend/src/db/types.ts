export type DatasetType =
  | 'customers'
  | 'transactions'
  | 'channels'
  | 'events'
  | 'acquiredVia'
  | 'channelSpendDaily'

export interface CustomerRecord {
  customerId: string
  acquisitionDate?: string
  channelSourceId?: string
  attrs?: Record<string, string | number>
}

export interface TransactionRecord {
  transactionId: string
  customerId: string
  revenueAmount: number
  date: string
  attrs?: Record<string, string | number>
}

export interface ChannelRecord {
  channelId: string
  name?: string
  budgetSpend?: number
  targetSegment?: string
  attrs?: Record<string, string | number>
}

export interface EventRecord {
  eventId: string
  customerId: string
  type: string
  date: string
  attrs?: Record<string, string | number>
}

export interface AcquiredViaRecord {
  customerId: string
  channelId: string
  weight?: number
  attributionModel?: string
}

export interface ChannelSpendDailyRecord {
  channelId: string
  date: string
  spend: number
}

export interface CustomerMetricsRecord {
  customerId: string
  ltv: number
  ltvSegment: SegmentKey
  firstPurchaseDate?: string
  lastPurchaseDate?: string
  txnCount: number
  computedAt: string
  modelVersion: number
}

export interface ChannelMetricsRecord {
  channelId: string
  cac: number
  spend: number
  acquiredCustomers: number
  highLtvCustomers: number
  highLtvShare: number
  netValue: number
  computedAt: string
  modelVersion: number
}

export interface SegmentMetricsRecord {
  segmentKey: SegmentKey
  customerCount: number
  avgLtv: number
  totalRevenue: number
  highChannelCount: number
  computedAt: string
  modelVersion: number
}

export type SegmentKey = 'HIGH' | 'MID' | 'LOW'

export interface ModelConfigRecord {
  key: 'active'
  ltvWindowDays: number | null
  churnEventTypes: string[]
  segmentHighQuantile: number
  segmentMidQuantile: number
  attributionMode: 'channel_field' | 'acquired_via'
  cacSpendSource: 'daily' | 'channel_total'
  defaultCurrency: string
  timezone: string
  cacLookbackDays: number | null
  createdAt: string
  updatedAt: string
}

export interface ImportMappingRecord {
  id?: number
  dataset: DatasetType
  columns: Record<string, string>
  sourceName: string
  createdAt: string
}

export type AuditLogType =
  | 'CREATE_PROJECT'
  | 'IMPORT_CUSTOMERS'
  | 'IMPORT_TRANSACTIONS'
  | 'IMPORT_CHANNELS'
  | 'IMPORT_EVENTS'
  | 'IMPORT_ACQUIRED_VIA'
  | 'IMPORT_SPEND'
  | 'RECOMPUTE'
  | 'SETTINGS_CHANGE'
  | 'ACTION_PLAN_APPROVED'
  | 'ACTION_PLAN_EXPORTED'

export interface AuditLogRecord {
  id?: number
  ts: string
  type: AuditLogType
  projectId: string
  userLabel: string
  payload?: Record<string, unknown>
}

export type JobStatus = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED'

export interface JobRecord {
  jobId: string
  type: 'import' | 'compute'
  dataset?: DatasetType
  status: JobStatus
  processedRows: number
  totalRows?: number
  phase: string
  startedAt: string
  updatedAt: string
}

export interface ActionPlanItem {
  channelId: string
  currentSpend: number
  proposedSpend: number
  delta: number
  rationale: string
}

export interface ActionPlanRecord {
  planId: string
  objective: string
  modelVersion: number
  createdAt: string
  approvedAt?: string
  exportedAt?: string
  items: ActionPlanItem[]
}

export interface ProjectMetaRecord {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  currency: string
  timezone: string
  schemaVersion: number
  lastOpenedAt?: string
  description?: string
}

export interface SpendRecommendation {
  channelId: string
  currentSpend: number
  proposedSpend: number
  rationale: string
}

export interface ImportJobPayload {
  projectId: string
  dataset: DatasetType
  file: File
  mapping: Record<string, string>
  options?: Record<string, unknown>
  jobId: string
}

export interface ImportProgressEvent {
  type: 'progress'
  processed: number
  total?: number
  phase: string
}

export interface ImportResultEvent {
  type: 'completed'
  processed: number
  warnings: string[]
}

export interface ImportErrorEvent {
  type: 'error'
  message: string
}

export type ImportWorkerResponse = ImportProgressEvent | ImportResultEvent | ImportErrorEvent

export interface ComputeJobPayload {
  projectId: string
  jobId: string
}

export interface ComputeProgressEvent {
  type: 'progress'
  phase: string
}

export interface ComputeCompletedEvent {
  type: 'completed'
  customerCount: number
  channelCount: number
}

export interface ComputeErrorEvent {
  type: 'error'
  message: string
}

export type ComputeWorkerResponse =
  | ComputeProgressEvent
  | ComputeCompletedEvent
  | ComputeErrorEvent
