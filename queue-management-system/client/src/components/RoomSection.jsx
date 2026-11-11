import { useState } from 'react';
import api from '../api/client';

// Shared with the staff panel so both agree on what each kind of staff works in.
export const ROOM_TYPES = [
  { value: 'room', label: 'Consultation room' },
  { value: 'lab', label: 'Laboratory' },
  { value: 'pharmacy', label: 'Pharmacy' },
];
export const TYPE_LABEL = Object.fromEntries(ROOM_TYPES.map((t) => [t.value, t.label]));
export const ROLE_ROOM_TYPE = { doctor: 'room', labstaff: 'lab', pharmacist: 'pharmacy' };

const MAX_NAME = 40;

// Admin tool for creating the places patients are sent to (consultation rooms,
// labs, pharmacies). Staff are then assigned to them from the staff table.
export default function RoomsSection({ rooms, departments, onChanged }) {
  const [form, setForm] = useState({ roomName: '', roomType: 'room', departmentId: '' });
  const [nameEdits, setNameEdits] = useState({}); // { [roomId]: unsaved text }
  const [busy, setBusy] = useState(null); // 'add' or a roomId while a request runs
  const [error, setError] = useState(null);

  async function run(key, request) {
    setBusy(key);
    setError(null);
    try {
      await request();
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  function handleAdd(e) {
    e.preventDefault();
    return run('add', async () => {
      await api.post('/api/rooms', {
        roomName: form.roomName.trim(),
        roomType: form.roomType,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
      });
      setForm((f) => ({ ...f, roomName: '' }));
    });
  }

  const saveName = (r) =>
    run(r.roomId, async () => {
      await api.patch(`/api/rooms/${r.roomId}`, { roomName: (nameEdits[r.roomId] ?? r.roomName).trim() });
      setNameEdits((prev) => {
        const next = { ...prev };
        delete next[r.roomId];
        return next;
      });
    });

  const changeDepartment = (r, value) =>
    run(r.roomId, () => api.patch(`/api/rooms/${r.roomId}`, { departmentId: value ? Number(value) : null }));

  function remove(r) {
    if (!window.confirm(`Delete ${r.roomName}?`)) return undefined;
    return run(r.roomId, () => api.post(`/api/rooms/${r.roomId}/delete`, {}));
  }

  return (
    <section className="card">
      <h2>Rooms, labs and pharmacies</h2>
      

      {error && <p className="error">{error}</p>}

      <form onSubmit={handleAdd}>
        <label htmlFor="roomType">Type</label>
        <select id="roomType" value={form.roomType} onChange={(e) => setForm((f) => ({ ...f, roomType: e.target.value }))}>
          {ROOM_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <label htmlFor="roomName">Name</label>
        <input
          id="roomName"
          value={form.roomName}
          onChange={(e) => setForm((f) => ({ ...f, roomName: e.target.value }))}
          placeholder="e.g. Room 3, Lab 1, Main Pharmacy"
          maxLength={MAX_NAME}
          required
        />

        <label htmlFor="roomDepartment">Department (optional)</label>
        <select
          id="roomDepartment"
          value={form.departmentId}
          onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
        >
          <option value="">Any department</option>
          {departments.map((d) => (
            <option key={d.departmentId} value={d.departmentId}>
              {d.departmentName}
            </option>
          ))}
        </select>

        <button type="submit" disabled={busy === 'add'} style={{ marginTop: '0.75rem' }}>
          {busy === 'add' ? 'Adding…' : 'Add room'}
        </button>
      </form>

      {rooms.length === 0 ? (
        <p style={{ marginTop: '1rem' }}>No rooms yet. Add the first one above.</p>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
          <table className="queue-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Department</th>
                <th>Staff assigned</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => {
                const edited = nameEdits[r.roomId];
                const dirty = edited !== undefined && edited.trim() !== r.roomName;
                const working = busy === r.roomId;
                return (
                  <tr key={r.roomId}>
                    <td>
                      <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <input
                          value={edited ?? r.roomName}
                          onChange={(e) => setNameEdits((prev) => ({ ...prev, [r.roomId]: e.target.value }))}
                          maxLength={MAX_NAME}
                          aria-label={`Name of ${r.roomName}`}
                          style={{ width: '9rem', margin: 0 }}
                        />
                        <button
                          type="button"
                          onClick={() => saveName(r)}
                          disabled={!dirty || working}
                          style={{ width: 'auto', margin: 0 }}
                        >
                          Save
                        </button>
                      </span>
                    </td>
                    <td>{TYPE_LABEL[r.roomType] || r.roomType}</td>
                    <td>
                      <select
                        value={r.departmentId ?? ''}
                        onChange={(e) => changeDepartment(r, e.target.value)}
                        disabled={working}
                        aria-label={`Department of ${r.roomName}`}
                        style={{ margin: 0, width: 'auto' }}
                      >
                        <option value="">Any department</option>
                        {departments.map((d) => (
                          <option key={d.departmentId} value={d.departmentId}>
                            {d.departmentName}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{r.staff.length ? r.staff.map((s) => s.name).join(', ') : <span style={{ color: '#999' }}>—</span>}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => remove(r)}
                        disabled={working || r.staff.length > 0}
                        title={r.staff.length > 0 ? 'Unassign the staff first' : undefined}
                        style={{ width: 'auto', margin: 0 }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
