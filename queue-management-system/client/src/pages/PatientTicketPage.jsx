import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import { socket } from '../api/socket';

const STATUS_LABELS = {
  pending: 'Waiting for check-in at reception',
  checked_in: 'In queue',
  in_progress: 'Being served now',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function PatientTicketPage() {
  const { ticketNumber } = useParams();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get(`/api/tickets/${ticketNumber}`, { auth: false });
      setTicket(data);
    } catch (err) {
      setError(err.message);
    }
  }, [ticketNumber]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates: refresh whenever this specific ticket changes.
  useEffect(() => {
    function handleUpdate(updated) {
      if (String(updated.ticketNumber) === String(ticketNumber)) {
        refresh();
      }
    }
    socket.on('ticket:updated', handleUpdate);
    return () => socket.off('ticket:updated', handleUpdate);
  }, [ticketNumber, refresh]);

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    try {
      await api.patch(`/api/tickets/${ticketNumber}/cancel`, {}, { auth: false });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  if (error && !ticket) {
    return (
      <div className="page page-centered">
        <div className="card">
          <p className="error">{error}</p>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="page page-centered">
        <div className="card">
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  const canCancel = ['pending', 'checked_in'].includes(ticket.status);

  return (
    <div className="page page-centered">
      <div className="card">
        <h1>Ticket #{ticket.ticketNumber}</h1>
        <p className="subtitle">{ticket.patient?.patientName}</p>

        <div className="status-row">
          <span className="status-label">Status</span>
          <span>{STATUS_LABELS[ticket.status] || ticket.status}</span>
        </div>

        <div className="status-row">
          <span className="status-label">Service</span>
          <span>{ticket.serviceType?.serviceName}</span>
        </div>

        {ticket.status === 'checked_in' && ticket.position != null && (
          <>
            <div className="status-row">
              <span className="status-label">Position in queue</span>
              <span>{ticket.position}</span>
            </div>
            <div className="status-row">
              <span className="status-label">Estimated wait</span>
              <span>{ticket.estimatedWaitMinutes} min</span>
            </div>
          </>
        )}

        {error && <p className="error">{error}</p>}

        {canCancel && (
          <button onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Cancelling…' : 'Cancel ticket'}
          </button>
        )}
      </div>
    </div>
  );
}
