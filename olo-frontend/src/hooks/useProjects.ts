import { useLiveQuery } from 'dexie-react-hooks'
import { metaDb } from '../db/metaDb'
import type { ProjectMetaRecord } from '../db/types'

export function useProjects(): ProjectMetaRecord[] | undefined {
  return useLiveQuery(async () => metaDb.projects.orderBy('createdAt').reverse().toArray())
}
