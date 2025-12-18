import { useMemo } from 'react'
import type { PropsWithChildren } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getProjectDb } from '../db/projectDb'
import type { ProjectMetaRecord } from '../db/types'
import { ProjectContext, type ProjectContextValue } from './useProjectContext'

interface ProjectProviderProps extends PropsWithChildren {
  projectId: string
  meta: ProjectMetaRecord
}

export function ProjectProvider({ projectId, meta, children }: ProjectProviderProps) {
  const db = useMemo(() => getProjectDb(projectId), [projectId])
  const config = useLiveQuery(() => db.modelConfig.get('active'), [db])

  const value = useMemo<ProjectContextValue>(
    () => ({
      projectId,
      db,
      meta,
      config: config ?? undefined,
      updateConfig: async (patch) => {
        await db.modelConfig.update('active', {
          ...patch,
          updatedAt: new Date().toISOString(),
        })
      },
    }),
    [projectId, db, meta, config],
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}
