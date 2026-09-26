import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Wrap any staff-only page: <ProtectedRoute><StaffDashboardPage /></ProtectedRoute>
// Redirects to /login if nobody's signed in.
export default function ProtectedRoute({ children }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
