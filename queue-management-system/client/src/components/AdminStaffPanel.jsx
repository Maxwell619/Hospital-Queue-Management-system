import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

const STAFF_TYPES = [
  { value: 'facilitator', label: 'Facilitator (doctor / lab / pharmacy)' },
  { value: 'triage_nurse', label: 'Triage nurse' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'administrator', label: 'Administrator' },
];

const FACILITATOR_ROLES = [
  { value: 'doctor', label: 'Doctor' },
  { value: 'labstaff', label: 'Lab staff' },
  { value: 'pharmacist', label: 'Pharmacist' },
];

const TYPE_LABEL = Object.fromEntries(STAFF_TYPES.map((t) => [t.value, t.label.split(' (')[0]]));

// Admins shouldn't have to invent passwords. This fills the field with a
// random one (no look-alike characters) that they can still overwrite.
function randomPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function blankForm(staffType = 'facilitator') {
  return {
    staffType,
    name: '',
    username: '',
    password: randomPassword(),
    departmentId: '',
    role: 'doctor',
    station: '',
  };
}

export default function AdminStaffPanel() {
  const [form, setForm] = useState(blankForm);
  const [departments, setDepartments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [created, setCreated] = useState(null); // shown once, includes the password
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Only facilitators belong to a department. Nurses and receptionists work
  // across the whole hospital; administrators have no department either.
  const needsDepartment = form.staffType === 'facilitator';
  const needsStation = form.staffType === 'triage_nurse' || form.staffType === 'receptionist';

  const loadStaff = useCallback(async () => {
    setStaff(await api.get('/api/staff'));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [depts, people] = await Promise.all([api.get('/api/departments'), api.get('/api/staff')]);
        if (cancelled) return;
        setDepartments(depts);
        setStaff(people);
        setForm((f) => ({ ...f, departmentId: depts.length ? String(depts[0].departmentId) : '' }));
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const body = {
        staffType: form.staffType,
        name: form.name.trim(),
        username: form.username.trim(),
        password: form.password,
      };
      if (needsDepartment) body.departmentId = Number(form.departmentId);
      if (form.staffType === 'facilitator') body.role = form.role;
      if (needsStation && form.station.trim()) body.station = form.station.trim();

      const person = await api.post('/api/staff', body);
      setCreated({ ...person, password: form.password });
      setForm({ ...blankForm(form.staffType), departmentId: form.departmentId });
      await loadStaff();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Staff</h2>

      {error && <p className="error">{error}</p>}

      {created && (
        <p>
          Created <strong>{created.name}</strong> ({TYPE_LABEL[created.staffType]}). Username{' '}
          <strong>{created.username}</strong>, password <strong>{created.password}</strong>. This is the
          only time the password is shown, so note it down.
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <label htmlFor="staffType">Type</label>
        <select
          id="staffType"
          value={form.staffType}
          onChange={(e) => update('staffType', e.target.value)}
        >
          {STAFF_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        {needsStation && (
          <p style={{ fontSize: '0.85rem', color: '#666' }}>
          
          </p>
        )}

        {form.staffType === 'facilitator' && (
          <>
            <label htmlFor="role">Role</label>
            <select id="role" value={form.role} onChange={(e) => update('role', e.target.value)}>
              {FACILITATOR_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </>
        )}

        {needsDepartment && (
          <>
            <label htmlFor="departmentId">Department</label>
            <select
              id="departmentId"
              value={form.departmentId}
              onChange={(e) => update('departmentId', e.target.value)}
             required
            >
              {departments.map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.departmentName}
                </option>
              ))}
            </select>
          </>
        )}

        <label htmlFor="name">Full name</label>
        <input id="name" value={form.name} onChange={(e) => update('name', e.target.value)} required />

        <label htmlFor="username">Username</label>
        <input
          id="username"
          value={form.username}
          onChange={(e) => update('username', e.target.value)}
          placeholder="e.g. jane.doe"
          required
        />

        {needsStation && (
          <>
            <label htmlFor="station">Station (optional)</label>
            <input id="station" value={form.station} onChange={(e) => update('station', e.target.value)} />
          </>
        )}

        <label htmlFor="password">Initial password</label>
        <input
          id="password"
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
          minLength={8}
          required
        />

        <button type="submit" disabled={busy} style={{ marginTop: '0.75rem' }}>
          {busy ? 'Creating…' : 'Create staff member'}
        </button>
      </form>

      <h3 style={{ marginTop: '1.5rem' }}>Current staff</h3>
      <table className="queue-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Department</th>
            <th>Username</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={`${s.staffType}-${s.id}`}>
              <td>{s.name}</td>
              <td>{s.role ? FACILITATOR_ROLES.find((r) => r.value === s.role)?.label ?? s.role : TYPE_LABEL[s.staffType]}</td>
              <td>{s.department ?? '—'}</td>
              <td>{s.username}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
    
  );
}
