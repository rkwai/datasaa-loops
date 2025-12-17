import Dexie from 'dexie'
import type { Table } from 'dexie'
import { nanoid } from 'nanoid'
import type { ProjectMetaRecord } from './types'
import { deleteProjectDb, initializeProjectDb, PROJECT_SCHEMA_VERSION } from './projectDb'

class MetaDatabase extends Dexie {
  projects!: Table<ProjectMetaRecord, string>

  constructor() {
    super('olo_meta_db')
    this.version(1).stores({
      projects: 'id, name, createdAt',
    })
  }
}

export const metaDb = new MetaDatabase()

export async function createProject(
  name: string,
  currency = 'USD',
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
) {
  const id = nanoid(10)
  const now = new Date().toISOString()
  await metaDb.projects.add({
    id,
    name,
    createdAt: now,
    updatedAt: now,
    currency,
    timezone,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    lastOpenedAt: now,
  })

  await initializeProjectDb(id, { defaultCurrency: currency, timezone })
  return id
}

export async function deleteProject(projectId: string) {
  await metaDb.transaction('rw', metaDb.projects, async () => {
    await metaDb.projects.delete(projectId)
  })

  await deleteProjectDb(projectId)
}

export async function renameProject(projectId: string, name: string) {
  await metaDb.projects.update(projectId, { name, updatedAt: new Date().toISOString() })
}

export async function touchProject(projectId: string) {
  await metaDb.projects.update(projectId, { lastOpenedAt: new Date().toISOString() })
}
