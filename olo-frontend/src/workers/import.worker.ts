/// <reference lib="webworker" />
import Papa from 'papaparse'
import type { Table } from 'dexie'
import { getProjectDb } from '../db/projectDb'
import type {
  DatasetType,
  ImportJobPayload,
  ImportWorkerResponse,
  JobRecord,
} from '../db/types'
import { mapRowToRecord } from '../utils/datasetSchemas'

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope

async function runImport(payload: ImportJobPayload) {
  const db = getProjectDb(payload.projectId)
  const text = await payload.file.text()
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })
  const rows = parsed.data.filter((row) => Object.keys(row).length > 0)
  const warnings: string[] = []
  const chunkSize = 2000
  let processed = 0
  const total = rows.length
  const startedAt = new Date().toISOString()

  async function updateJob(partial: Partial<JobRecord>) {
    await db.jobs.put({
      jobId: payload.jobId,
      type: 'import',
      dataset: payload.dataset,
      status: 'RUNNING',
      processedRows: processed,
      totalRows: total,
      phase: partial.phase ?? 'parsing',
      startedAt,
      updatedAt: new Date().toISOString(),
      ...partial,
    })
  }

  await updateJob({ phase: 'parsing' })

  const targetTable = db.table(payload.dataset as string) as Table<unknown, unknown>

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const mapped = chunk.map((row, index) =>
      mapRowToRecord(payload.dataset, row, payload.mapping, i + index + 1, warnings),
    )
    const valid = mapped.filter(
      (record): record is Exclude<typeof record, null> => record !== null,
    )

    await db.transaction('rw', targetTable, async () => {
      await targetTable.bulkPut(valid as unknown[])
    })
    processed += valid.length
    await updateJob({ phase: `writing (${processed}/${total})` })

    ctx.postMessage({
      type: 'progress',
      processed,
      total,
      phase: 'writing',
    } satisfies ImportWorkerResponse)
  }

  await db.jobs.update(payload.jobId, {
    status: 'COMPLETED',
    processedRows: processed,
    updatedAt: new Date().toISOString(),
    phase: 'done',
  })

  await db.auditLog.add({
    ts: new Date().toISOString(),
    type: mapDatasetToAudit(payload.dataset),
    payload: { processed },
    projectId: payload.projectId,
    userLabel: 'local-user',
  })

  ctx.postMessage({ type: 'completed', processed, warnings } satisfies ImportWorkerResponse)
}

function mapDatasetToAudit(dataset: DatasetType) {
  switch (dataset) {
    case 'customers':
      return 'IMPORT_CUSTOMERS'
    case 'transactions':
      return 'IMPORT_TRANSACTIONS'
    case 'channels':
      return 'IMPORT_CHANNELS'
    case 'events':
      return 'IMPORT_EVENTS'
    case 'acquiredVia':
      return 'IMPORT_ACQUIRED_VIA'
    case 'channelSpendDaily':
      return 'IMPORT_SPEND'
    default:
      return 'IMPORT_CUSTOMERS'
  }
}

ctx.onmessage = (event: MessageEvent<ImportJobPayload>) => {
  runImport(event.data).catch((error) => {
    ctx.postMessage({ type: 'error', message: error.message } satisfies ImportWorkerResponse)
  })
}
export {}
