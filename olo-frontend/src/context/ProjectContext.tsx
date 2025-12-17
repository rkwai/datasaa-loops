import { createContext, useContext, useMemo } from 'react'
import type { PropsWithChildren } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getProjectDb } from '../db/projectDb'
import type { ProjectDatabase } from '../db/projectDb'
import type { ProjectMetaRecord, ModelConfigRecord } from '../db/types'

interface ProjectContextValue {
  projectId: string
  db: ProjectDatabase
  meta: ProjectMetaRecord
  config?: ModelConfigRecord
  updateConfig: (patch: Partial<ModelConfigRecord>) => Promise<void>
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

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

export function useProjectContext() {
  const ctx = useContext(ProjectContext)
  if (!ctx) {
    throw new Error('useProjectContext must be used inside ProjectProvider')
  }
  return ctx
}
