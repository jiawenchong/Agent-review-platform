import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { NotificationProvider } from './context/NotificationContext';
import { UploadResultsProvider } from './context/UploadResultsContext';
import { Dashboard } from './pages/Dashboard';
import { ProjectDetail } from './pages/ProjectDetail';
import { Upload } from './pages/Upload';
import { Notifications } from './pages/Notifications';
import { Report } from './pages/Report';
import { AuditLog } from './pages/AuditLog';
import { ValidationReport } from './pages/ValidationReport';

function App() {
  return (
    <NotificationProvider>
      <UploadResultsProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/report" element={<Report />} />
            <Route path="/audit" element={<AuditLog />} />
            <Route path="/validation-report" element={<ValidationReport />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </UploadResultsProvider>
    </NotificationProvider>
  );
}

export default App;
