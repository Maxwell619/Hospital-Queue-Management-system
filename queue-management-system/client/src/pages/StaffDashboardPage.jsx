import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { socket } from '../api/socket';
import { useAuth } from '../context/AuthContext';

// Resolves the department a logged-in staff member belongs to.
// facilitator and triage_nurse have departmentId directly; receptionist
// only has facilitatorId, so it's a two-hop lookup through their
// supervising facilitator. administrator has no department at all --
// their view isn't queue-based.
async function resolveDepartmentId(user) {
  if (user.staffType === 'facilitator') {
    const facilitator = await api.get(`/api/facilitators/${user.id}`);
    return facilitator.departmentId;
  }
  if (user.staffType === 'triage_nurse') {
    const nurse = await api.get(`/api/triage-nurses/${user.id}`);
    return nurse.departmentId;
  }
  if (user.staffType === 'receptionist') {
    const receptionist = await api.get(`/api/receptionists/${user.id}`);
    const facilitator = await api.get(`/api/facilitators/${receptionist.facilitatorId}`);
    return facilitator.departmentId;
  }
  return null;
}

export default function StaffDashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [departmentId, setDepartmentId] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [activeService, setActiveService] = useState(null); // facilitator only
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);

  const queueStatus = user.staffType === 'receptionist' ? 'pending' : 'checked_in';

  const refreshQueue = useCallback(async (deptId) => {
    if (!deptId) return;
    const data = await api.get(`/api/tickets?departmentId=${deptId}&status=${queueStatus}`);
    setTickets(data);
  }, [queueStatus]);

  // Initial load: figure out the department, then load its queue.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);
      try {
        if (user.staffType === 'administrator') {
          setLoading(false);
          return;
        }
        const deptId = await resolveDepartmentId(user);
        if (cancelled) return;
        setDepartmentId(deptId);
        await refreshQueue(deptId);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.staffType]);

  // Live updates: any ticket change in our department refreshes the list.
  useEffect(() => {
    if (!departmentId) return;

    function handleUpdate(ticket) {
      if (ticket.departmentId === departmentId) {
        refreshQueue(departmentId);
      }
    }

    socket.on('ticket:updated', handleUpdate);
    return () => socket.off('ticket:updated', handleUpdate);
  }, [departmentId, refreshQueue]);

  async function handleCheckIn(ticketNumber) {
    setActionBusy(true);
    setError(null);
    try {
      await api.patch(`/api/tickets/${ticketNumber}/check-in`, {});
      await refreshQueue(departmentId);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCallNext() {
    setActionBusy(true);
    setError(null);
    try {
      const result = await api.post('/api/services/call-next', { departmentId });
      setActiveService(result.service);
      await refreshQueue(departmentId);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCompleteService() {
    if (!activeService) return;
    setActionBusy(true);
    setError(null);
    try {
      await api.patch(`/api/services/${activeService.serviceId}/complete`, {});
      setActiveService(null);
      await refreshQueue(departmentId);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleGenerateReport() {
    setActionBusy(true);
    setError(null);
    try {
      const report = await api.post('/api/reports/generate', {});
      alert(`Report #${report.reportId}: ${report.numberOfPatientsServed} patients served`);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="page">
      <header className="topbar">
        <span>Queue Management System</span>
        <span className="topbar-user">
          {user.name} ({user.staffType})
          <button className="link-button" onClick={handleLogout}>
            Log out
          </button>
        </span>
      </header>

      <main className="content">
        {error && <p className="error">{error}</p>}

        {user.staffType === 'administrator' && (
          <section className="card">
            <h2>Reports</h2>
            <p>Generate a report of completed tickets across all departments.</p>
            <button onClick={handleGenerateReport} disabled={actionBusy}>
              Generate report
            </button>
          </section>
        )}

        {user.staffType !== 'administrator' && (
          <section className="card">
            <h2>
              {user.staffType === 'receptionist' ? 'Tickets awaiting check-in' : 'Queue'}
            </h2>

            {loading && <p>Loading…</p>}

            {!loading && tickets.length === 0 && <p>No tickets waiting.</p>}

            {!loading && tickets.length > 0 && (
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Patient</th>
                    <th>Service</th>
                    {user.staffType === 'receptionist' && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.ticketNumber}>
                      <td>#{t.ticketNumber}</td>
                      <td>{t.patient?.patientName}</td>
                      <td>{t.serviceType?.serviceName}</td>
                      {user.staffType === 'receptionist' && (
                        <td>
                          <button onClick={() => handleCheckIn(t.ticketNumber)} disabled={actionBusy}>
                            Check in
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {user.staffType === 'facilitator' && !activeService && (
              <button onClick={handleCallNext} disabled={actionBusy || tickets.length === 0}>
                Call next patient
              </button>
            )}

            {user.staffType === 'facilitator' && activeService && (
              <div className="active-service">
                <p>Now serving ticket #{activeService.ticketNumber} — service in progress.</p>
                <button onClick={handleCompleteService} disabled={actionBusy}>
                  Mark complete
                </button>
              </div>
            )}

            {user.staffType === 'triage_nurse' && (
              <p className="note">
                Triage nurses currently have a read-only queue view — no call/complete actions
                are wired to this role in the API yet.
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
