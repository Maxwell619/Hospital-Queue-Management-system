import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import StaffDashboardPage from './pages/StaffDashboardPage';
import PatientRegisterPage from './pages/PatientRegisterPage';
import PatientTicketPage from './pages/PatientTicketPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
