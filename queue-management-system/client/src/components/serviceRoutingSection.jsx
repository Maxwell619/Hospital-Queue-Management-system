import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

const OPTIONS = [
  { value: '', label: 'Triage nurse (normal route)' },
  { value: 'labstaff', label: 'Straight to the lab' },
  { value: 'pharmacist', label: 'Straight to the pharmacy' },
];
const ROLE_NAME = { labstaff: 'lab staff', pharmacist: 'pharmacists' };

// Admin tool: choose which services skip the triage nurse. After reception checks
// the patient in, a ticket for such a service goes straight to the lab or pharmacy.
export default function ServiceRoutingSection() {
  const [data, setData] = useState({ services: [], staffCounts: {} });
  const [error, setError] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setData(await api.get('/api/service-routing'));
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  async function change(service, value) {
    setSavingId(service.serviceId);
    setError(null);
    try {
      await api.patch(`/api/service-routing/${service.serviceId}`, { directRouteRole: value || null });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="card">
      <h2>Where patients go after reception</h2>
      

      {error && <p className="error">{error}</p>}

      {data.services.length === 0 ? (
        <p>No services found.</p>
      ) : (
        <table className="queue-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>After check-in</th>
            </tr>
          </thead>
          <tbody>
            {data.services.map((s) => {
              const role = s.directRouteRole;
              const nobody = role && !data.staffCounts[role];
              return (
                <tr key={s.serviceId}>
                  <td>{s.serviceName}</td>
                  <td>
                    <select
                      value={role ?? ''}
                      onChange={(e) => change(s, e.target.value)}
                      disabled={savingId === s.serviceId}
                      aria-label={`Route for ${s.serviceName}`}
                      style={{ margin: 0, width: 'auto' }}
                    >
                      {OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {nobody && (
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: '#b45309' }}>
                        No {ROLE_NAME[role]} yet, so these patients will wait for triage.
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
