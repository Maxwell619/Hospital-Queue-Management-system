import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { socket } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import AdminStaffPanel from '../components/AdminStaffPanel';

async function resolveDepartmentId(user) {
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
  const [tickets, setTickets] = useState([]); // receptionist (pending) / triage_nurse (checked_in)
  const [pendingServices, setPendingServices] = useState([]); // facilitator: assigned, not started
  const [activeServices, setActiveServices] = useState([]); // facilitator: started, not completed
  const [departments, setDepartments] = useState([]); // triage nurse: routing targets
  // Each ticket gets its own destination: { [ticketNumber]: departmentId }.
  // A single shared value meant every patient was routed to the same place.
  const [triageSelections, setTriageSelections] = useState({});
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null); // success message after routing
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);

  const queueStatus = user.staffType === 'receptionist' ? 'pending' : 'checked_in';

  const refreshQueue = useCallback(async (deptId) => {
    if (!deptId) return;
    const data = await api.get(`/api/tickets?departmentId=${deptId}&status=${queueStatus}`);
    setTickets(data);
  }, [queueStatus]);

  const refreshServices = useCallback(async () => {
    const [pending, active] = await Promise.all([
      api.get('/api/services?completionStatus=pending'),
      api.get('/api/services?completionStatus=in_progress'),
    ]);
    setPendingServices(pending);
    setActiveServices(active);
  }, []);

  // Initial load.
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
        if (user.staffType === 'facilitator') {
          await refreshServices();
          setLoading(false);
          return;
        }
        const deptId = await resolveDepartmentId(user);
        if (cancelled) return;
        setDepartmentId(deptId);
        if (user.staffType === 'triage_nurse') {
          setDepartments(await api.get('/api/departments', { auth: false }));
        }
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

  // Live updates.
  useEffect(() => {
    function handleUpdate() {
      if (user.staffType === 'facilitator') {
        refreshServices();
      } else if (departmentId) {
        // No department filter on purpose: triage changes a ticket's
        // departmentId to the specialty it was routed to, so filtering
        // on ticket.departmentId would miss exactly the update that
        // should remove it from this (intake) queue.
        refreshQueue(departmentId);
      }
    }

    socket.on('ticket:updated', handleUpdate);
    return () => socket.off('ticket:updated', handleUpdate);
  }, [departmentId, refreshQueue, refreshServices, user.staffType]);

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

  function selectTriageDepartment(ticketNumber, value) {
    setTriageSelections((prev) => ({ ...prev, [ticketNumber]: value }));
  }

  async function handleTriage(ticketNumber) {
    const chosen = triageSelections[ticketNumber];
    if (!chosen) return;

    setActionBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.post(`/api/triage/${ticketNumber}`, {
        departmentId: Number(chosen),
      });
      // The row disappears from this list once routed, so say where it went.
      setNotice(
        `Ticket #${ticketNumber} routed to ${result.department.departmentName} — ` +
          `assigned to ${result.facilitator.facilitatorName}.`
      );
      await refreshQueue(departmentId);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleStartService(serviceId) {
    setActionBusy(true);
    setError(null);
    try {
      await api.patch(`/api/services/${serviceId}/start`, {});
      await refreshServices();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCompleteService(serviceId) {
    setActionBusy(true);
    setError(null);
    try {
      await api.patch(`/api/services/${serviceId}/complete`, {});
      await refreshServices();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }
  async function handleRefer(serviceId, to) {
    setActionBusy(true);
    setError(null);
    try {
      await api.patch(`/api/services/${serviceId}/refer`, { to });
      await refreshServices();
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
        {notice && <p style={{ color: '#2e7d32', fontSize: '0.9rem' }}>{notice}</p>}
        {loading && <p>Loading…</p>}

        {!loading && user.staffType === 'administrator' && (
     <>
       <section className="card">
         <h2>Reports</h2>
         <p>Generate a report of completed tickets across all departments.</p>
         <button onClick={handleGenerateReport} disabled={actionBusy}>Generate report</button>
       </section>
       <AdminStaffPanel />
     </>
   )}

        {!loading && user.staffType === 'facilitator' && (
          <>
            <section className="card">
              <h2>Assigned to you — not started</h2>
              {pendingServices.length === 0 && <p>Nothing waiting.</p>}
              {pendingServices.length > 0 && (
                <table className="queue-table">
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Patient</th>
                      <th>Service</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingServices.map((s) => (
                      <tr key={s.serviceId}>
                        <td>#{s.ticket?.ticketNumber}</td>
                        <td>{s.ticket?.patient?.patientName}</td>
                        <td>{s.ticket?.serviceType?.serviceName}</td>
                        <td>
                          <button onClick={() => handleStartService(s.serviceId)} disabled={actionBusy}>
                            Start
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="card">
              <h2>In progress</h2>
              {activeServices.length === 0 && <p>Nothing in progress.</p>}
              {activeServices.map((s) => (
  <div className="active-service" key={s.serviceId}>
    <p>
      Now serving ticket #{s.ticket?.ticketNumber} — {s.ticket?.patient?.patientName}
    </p>
    {s.facilitator?.role === 'doctor' && (
      <>
        <button onClick={() => handleRefer(s.serviceId, 'lab')} disabled={actionBusy}>
          Refer to lab
        </button>
        <button onClick={() => handleRefer(s.serviceId, 'pharmacy')} disabled={actionBusy}>
          Refer to pharmacy
        </button>
      </>
    )}
    <button onClick={() => handleCompleteService(s.serviceId)} disabled={actionBusy}>
      {s.facilitator?.role === 'doctor' ? 'Complete visit' : 'Mark complete'}
    </button>
  </div>
))}
            </section>
          </>
        )}

        {!loading && user.staffType === 'receptionist' && (
          <section className="card">
            <h2>Tickets awaiting check-in</h2>
            {tickets.length === 0 && <p>No tickets waiting.</p>}
            {tickets.length > 0 && (
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Patient</th>
                    <th>Service</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.ticketNumber}>
                      <td>#{t.ticketNumber}</td>
                      <td>{t.patient?.patientName}</td>
                      <td>{t.serviceType?.serviceName}</td>
                      <td>
                        <button onClick={() => handleCheckIn(t.ticketNumber)} disabled={actionBusy}>
                          Check in
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {!loading && user.staffType === 'triage_nurse' && (
          <section className="card">
            <h2>Checked-in patients</h2>
            {tickets.length === 0 && <p>No patients waiting for triage.</p>}
            {tickets.length > 0 && (
              <table className="queue-table">
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Patient</th>
                    <th>Service</th>
                    <th>Route to</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => {
                    const chosen = triageSelections[t.ticketNumber] || '';
                    const chosenDept = departments.find(
                      (d) => String(d.departmentId) === String(chosen)
                    );

                    return (
                      <tr key={t.ticketNumber}>
                        <td>#{t.ticketNumber}</td>
                        <td>{t.patient?.patientName}</td>
                        <td>{t.serviceType?.serviceName}</td>
                        <td>
                          <select
                            value={chosen}
                            onChange={(e) => selectTriageDepartment(t.ticketNumber, e.target.value)}
                            aria-label={`Department for ticket ${t.ticketNumber}`}
                          >
                            <option value="">Select department…</option>
                            {departments.map((d) => (
                              <option key={d.departmentId} value={d.departmentId}>
                                {d.departmentName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            onClick={() => handleTriage(t.ticketNumber)}
                            disabled={actionBusy || !chosen}
                          >
                            {chosenDept ? `Route → ${chosenDept.departmentName}` : 'Route'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
