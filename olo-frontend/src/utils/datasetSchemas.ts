import type {
  AcquiredViaRecord,
  ChannelRecord,
  ChannelSpendDailyRecord,
  CustomerRecord,
  DatasetType,
  EventRecord,
  TransactionRecord,
} from '../db/types'

export interface DatasetFieldSpec {
  key: string
  label: string
  required: boolean
  type: 'string' | 'number' | 'date'
  description?: string
}

export interface DatasetSchema {
  type: DatasetType
  label: string
  description: string
  fields: DatasetFieldSpec[]
}

export const DATASET_SCHEMAS: Record<DatasetType, DatasetSchema> = {
  customers: {
    type: 'customers',
    label: 'Customers',
    description: 'Identifiers and acquisition metadata for each buyer.',
    fields: [
      { key: 'customerId', label: 'Customer ID', required: true, type: 'string' },
      { key: 'acquisitionDate', label: 'Acquisition date', required: false, type: 'date' },
      { key: 'channelSourceId', label: 'Channel source ID', required: false, type: 'string' },
    ],
  },
  transactions: {
    type: 'transactions',
    label: 'Transactions',
    description: 'Revenue events linked to customers.',
    fields: [
      { key: 'transactionId', label: 'Transaction ID', required: true, type: 'string' },
      { key: 'customerId', label: 'Customer ID', required: true, type: 'string' },
      { key: 'revenueAmount', label: 'Revenue amount', required: true, type: 'number' },
      { key: 'date', label: 'Transaction date', required: true, type: 'date' },
    ],
  },
  channels: {
    type: 'channels',
    label: 'Channels',
    description: 'Paid / owned channels.',
    fields: [
      { key: 'channelId', label: 'Channel ID', required: true, type: 'string' },
      { key: 'name', label: 'Channel name', required: false, type: 'string' },
      { key: 'budgetSpend', label: 'Budget spend (total)', required: false, type: 'number' },
      { key: 'targetSegment', label: 'Target segment', required: false, type: 'string' },
    ],
  },
  events: {
    type: 'events',
    label: 'Customer events',
    description: 'Lifecycle or churn signals.',
    fields: [
      { key: 'eventId', label: 'Event ID', required: true, type: 'string' },
      { key: 'customerId', label: 'Customer ID', required: true, type: 'string' },
      { key: 'type', label: 'Event type', required: true, type: 'string' },
      { key: 'date', label: 'Event date', required: true, type: 'date' },
    ],
  },
  acquiredVia: {
    type: 'acquiredVia',
    label: 'Acquired via',
    description: 'Explicit channel-customer link records.',
    fields: [
      { key: 'customerId', label: 'Customer ID', required: true, type: 'string' },
      { key: 'channelId', label: 'Channel ID', required: true, type: 'string' },
      { key: 'weight', label: 'Weight (0-1)', required: false, type: 'number' },
    ],
  },
  channelSpendDaily: {
    type: 'channelSpendDaily',
    label: 'Channel spend daily',
    description: 'Daily spend inputs per channel.',
    fields: [
      { key: 'channelId', label: 'Channel ID', required: true, type: 'string' },
      { key: 'date', label: 'Spend date', required: true, type: 'date' },
      { key: 'spend', label: 'Spend amount', required: true, type: 'number' },
    ],
  },
}

export const DATASET_OPTIONS = Object.values(DATASET_SCHEMAS)

type RawRow = Record<string, string>

export type CanonicalRecord =
  | CustomerRecord
  | TransactionRecord
  | ChannelRecord
  | EventRecord
  | AcquiredViaRecord
  | ChannelSpendDailyRecord

const usedValue = (value?: string) => (value === undefined || value === '' ? undefined : value)

function toIsoDate(value?: string) {
  const parsed = usedValue(value)
  if (!parsed) return undefined
  const date = new Date(parsed)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return date.toISOString()
}

function toNumber(value?: string) {
  const parsed = usedValue(value)
  if (!parsed) return undefined
  const num = Number(parsed)
  if (Number.isNaN(num)) return undefined
  return num
}

export function mapRowToRecord(
  dataset: DatasetType,
  row: RawRow,
  mapping: Record<string, string>,
  rowIndex: number,
  warnings: string[],
): CanonicalRecord | null {
  const pick = (key: string) => {
    const column = mapping[key]
    if (!column) return undefined
    return row[column]
  }
  const usedColumns = new Set(Object.values(mapping).filter(Boolean))

  switch (dataset) {
    case 'customers': {
      const customerId = usedValue(pick('customerId'))
      if (!customerId) {
        warnings.push(`Row ${rowIndex}: missing customer ID`)
        return null
      }
      const record: CustomerRecord = {
        customerId,
        acquisitionDate: toIsoDate(pick('acquisitionDate')),
        channelSourceId: usedValue(pick('channelSourceId')),
      }
      const attrs: Record<string, string> = {}
      Object.entries(row).forEach(([key, value]) => {
        if (!usedColumns.has(key) && usedValue(value) !== undefined) {
          attrs[key] = value
        }
      })
      if (Object.keys(attrs).length) {
        record.attrs = attrs
      }
      return record
    }
    case 'transactions': {
      const transactionId = usedValue(pick('transactionId'))
      const customerId = usedValue(pick('customerId'))
      const amount = toNumber(pick('revenueAmount'))
      const date = toIsoDate(pick('date'))
      if (!transactionId || !customerId || amount === undefined || !date) {
        warnings.push(`Row ${rowIndex}: invalid transaction row (missing fields)`)
        return null
      }
      const record: TransactionRecord = {
        transactionId,
        customerId,
        revenueAmount: amount,
        date,
      }
      return record
    }
    case 'channels': {
      const channelId = usedValue(pick('channelId'))
      if (!channelId) {
        warnings.push(`Row ${rowIndex}: missing channel ID`)
        return null
      }
      const record: ChannelRecord = {
        channelId,
        name: usedValue(pick('name')),
        targetSegment: usedValue(pick('targetSegment')),
        budgetSpend: toNumber(pick('budgetSpend')) ?? undefined,
      }
      return record
    }
    case 'events': {
      const eventId = usedValue(pick('eventId'))
      const customerId = usedValue(pick('customerId'))
      const type = usedValue(pick('type'))
      const date = toIsoDate(pick('date'))
      if (!eventId || !customerId || !type || !date) {
        warnings.push(`Row ${rowIndex}: invalid event row`)
        return null
      }
      const record: EventRecord = {
        eventId,
        customerId,
        type,
        date,
      }
      return record
    }
    case 'acquiredVia': {
      const customerId = usedValue(pick('customerId'))
      const channelId = usedValue(pick('channelId'))
      if (!customerId || !channelId) {
        warnings.push(`Row ${rowIndex}: invalid acquiredVia row`)
        return null
      }
      const record: AcquiredViaRecord = {
        customerId,
        channelId,
        weight: toNumber(pick('weight')) ?? 1,
        attributionModel: 'first_touch',
      }
      return record
    }
    case 'channelSpendDaily': {
      const channelId = usedValue(pick('channelId'))
      const date = toIsoDate(pick('date'))
      const spend = toNumber(pick('spend'))
      if (!channelId || !date || spend === undefined) {
        warnings.push(`Row ${rowIndex}: invalid spend row`)
        return null
      }
      const record: ChannelSpendDailyRecord = {
        channelId,
        date,
        spend,
      }
      return record
    }
    default:
      return null
  }
}
