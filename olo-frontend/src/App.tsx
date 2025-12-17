import { Navigate, Route, Routes } from 'react-router-dom'
import { ProjectHome } from './screens/ProjectHome'
import { ProjectShell } from './screens/project/ProjectShell'
import { SegmentDashboard } from './screens/project/SegmentDashboard'
import { ImportWizardScreen } from './screens/project/ImportWizardScreen'
import { AttributionMapScreen } from './screens/project/AttributionMapScreen'
import { SpendPlanScreen } from './screens/project/SpendPlanScreen'
import { SettingsScreen } from './screens/project/SettingsScreen'
import { AuditLogScreen } from './screens/project/AuditLogScreen'
import { ExportScreen } from './screens/project/ExportScreen'

function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectHome />} />
      <Route path="/project/:projectId/*" element={<ProjectShell />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<SegmentDashboard />} />
        <Route path="import" element={<ImportWizardScreen />} />
        <Route path="attribution" element={<AttributionMapScreen />} />
        <Route path="plan" element={<SpendPlanScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="audit" element={<AuditLogScreen />} />
        <Route path="export" element={<ExportScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
