import { createContext, useContext } from 'react'
import type { ProjectDatabase } from '../db/projectDb'
import type { ProjectMetaRecord, ModelConfigRecord } from '../db/types'

export interface ProjectContextValue {
  projectId: string
  db: ProjectDatabase
  meta: ProjectMetaRecord
  config?: ModelConfigRecord
  updateConfig: (patch: Partial<ModelConfigRecord>) => Promise<void>
}

export const ProjectContext = createContext<ProjectContextValue | null>(null)

export function useProjectContext() {
  const ctx = useContext(ProjectContext)
  if (!ctx) {
    throw new Error('useProjectContext must be used inside ProjectProvider')
  }
  return ctx
}
