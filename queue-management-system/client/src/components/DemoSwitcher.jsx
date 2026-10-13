import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';



const DEMO_PASSWORD = 'password123';


const DEMO_ACCOUNTS = [
  { label: 'Receptionist', username: 'grace.njeri', name: 'Grace Njeri' },
  { label: 'Triage nurse', username: 'mary.wanjiru', name: 'Mary Wanjiru' },
  { label: 'Doctor (Respiratory)', username: 'lucy.achieng', name: 'Dr. Lucy Achieng' },
  { label: 'Doctor (Dermatology)', username: 'peter.kimani', name: 'Dr. Peter Kimani' },
  { label: 'Administrator', username: 'kevin.mutua', name: 'Kevin Mutua' },
];


const PATIENT_PATH = null;

export default function DemoSwitcher() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  
  if (!import.meta.env.DEV) return null;

  async function switchTo(account) {
    setBusy(account.username);
    setError(null);
    try {
      await login(account.username, DEMO_PASSWORD);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const tabStyle = (active) => ({
    padding: '0.35rem 0.75rem',
    fontSize: '0.85rem',
    borderRadius: '6px',
    border: '1px solid #2b2b2b',
    background: active ? '#2b2b2b' : '#fff',
    color: active ? '#fff' : '#2b2b2b',
    cursor: 'pointer',
  });

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem',
        padding: '0.5rem 1.5rem',
        background: '#fff8e1',
        borderBottom: '1px solid #e6d9a8',
      }}
    >
      <span style={{ fontSize: '0.8rem', color: '#7a6a2f' }}>Demo mode — switch actor:</span>

      {DEMO_ACCOUNTS.map((account) => (
        <button
          key={account.username}
          style={tabStyle(user?.name === account.name)}
          onClick={() => switchTo(account)}
          disabled={busy !== null}
        >
          {busy === account.username ? 'Switching…' : account.label}
        </button>
      ))}

      {PATIENT_PATH && (
        <button style={tabStyle(false)} onClick={() => navigate(PATIENT_PATH)}>
          Patient
        </button>
      )}

      {error && <span style={{ color: '#b3261e', fontSize: '0.8rem' }}>{error}</span>}
    </div>
  );
}
