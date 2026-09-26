import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const STAFF_TYPES = [
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'facilitator', label: 'Facilitator (doctor / lab / pharmacist)' },
  { value: 'triage_nurse', label: 'Triage nurse' },
  { value: 'administrator', label: 'Administrator' },
];

export default function LoginPage() {
  const [staffType, setStaffType] = useState('receptionist');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(staffType, username, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page page-centered">
      <form className="card" onSubmit={handleSubmit}>
        <h1>Queue Management System</h1>
        <p className="subtitle">Staff sign in</p>

        <label htmlFor="staffType">Role</label>
        <select id="staffType" value={staffType} onChange={(e) => setStaffType(e.target.value)}>
          {STAFF_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
