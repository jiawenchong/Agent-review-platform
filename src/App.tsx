import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { NotificationProvider } from './context/NotificationContext';
import { UploadResultsProvider } from './context/UploadResultsContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Dashboard } from './pages/Dashboard';
import { ProjectDetail } from './pages/ProjectDetail';
import { Upload } from './pages/Upload';
import { Notifications } from './pages/Notifications';
import { Report } from './pages/Report';
import { AuditLog } from './pages/AuditLog';
import { ValidationReport } from './pages/ValidationReport';
import { Login } from './pages/Login';

// Wraps the authenticated part of the app. Redirects to /login if no session.
function ProtectedApp() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

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

function LoginPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <Login onSuccess={() => navigate('/', { replace: true })} />;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedApp />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
