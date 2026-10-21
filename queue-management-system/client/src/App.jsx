import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import StaffDashboardPage from './pages/StaffDashboardPage';
import AnalyticsPage from './pages/AnalyticsPage';
import PatientRegisterPage from './pages/PatientRegisterPage';
import PatientTicketPage from './pages/PatientTicketPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Every page inside this route gets the sidebar */}
          <Route element={<AppLayout />}>
            {/* Patient-facing, no login */}
            <Route path="/" element={<PatientRegisterPage />} />
            <Route path="/ticket/:ticketNumber" element={<PatientTicketPage />} />

            {/* Staff-facing */}
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <StaffDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute>
                  <AnalyticsPage />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
