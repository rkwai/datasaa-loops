import JSZip from 'jszip'
import { createProject, metaDb } from '../db/metaDb'
import { getProjectDb } from '../db/projectDb'
import type { ModelConfigRecord, ProjectMetaRecord } from '../db/types'

const EXPORT_TABLES = [
  'customers',
  'transactions',
  'channels',
  'events',
  'acquiredVia',
  'channelSpendDaily',
  'customerMetrics',
  'channelMetrics',
  'segmentMetrics',
  'importMappings',
  'auditLog',
  'jobs',
  'actionPlans',
] as const

type ExportTableName = (typeof EXPORT_TABLES)[number]

export async function exportProjectBundle(projectId: string) {
  const meta = await metaDb.projects.get(projectId)
  if (!meta) throw new Error('Project not found')
  const db = getProjectDb(projectId)
  const config = await db.modelConfig.get('active')
  const zip = new JSZip()

  const manifest = {
    projectMeta: meta,
    schemaVersion: meta.schemaVersion,
    exportedAt: new Date().toISOString(),
    modelConfig: config,
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  await Promise.all(
    EXPORT_TABLES.map(async (tableName) => {
      const rows = await db.table(tableName).toArray()
      const lines = rows.map((row) => JSON.stringify(row)).join('\n')
      zip.file(`${tableName}.jsonl`, lines)
    }),
  )

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export async function importProjectBundle(file: Blob) {
  const zipSource = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(zipSource)
  const manifestEntry = zip.file('manifest.json')
  if (!manifestEntry) {
    throw new Error('Invalid bundle: manifest missing')
  }
  const manifest = JSON.parse(await manifestEntry.async('string')) as {
    projectMeta?: Partial<ProjectMetaRecord>
    modelConfig?: ModelConfigRecord
  }

  const name = manifest.projectMeta?.name ?? `Imported project ${new Date().toLocaleString()}`
  const currency = manifest.projectMeta?.currency ?? 'USD'
  const timezone = manifest.projectMeta?.timezone ?? 'UTC'
  const projectId = await createProject(name, currency, timezone)
  const db = getProjectDb(projectId)

  for (const table of EXPORT_TABLES) {
    const entry = zip.file(`${table}.jsonl`)
    if (!entry) continue
    const text = await entry.async('string')
    const rows = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    const tableRef = db.table(table as ExportTableName)
    await tableRef.clear()
    if (rows.length) {
      await tableRef.bulkAdd(rows)
    }
  }

  if (manifest.modelConfig) {
    await db.modelConfig.put({
      ...manifest.modelConfig,
      key: 'active',
      updatedAt: new Date().toISOString(),
    })
  }

  return projectId
}
