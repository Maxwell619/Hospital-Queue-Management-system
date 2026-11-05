import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import { socket } from '../api/socket';

const STATUS_LABELS = {
  pending: 'Waiting for check-in at reception',
  checked_in: 'In queue',
  triaged: 'Sent to a department, waiting to be called',
  referred: 'Referred onward, waiting to be called',
  in_progress: 'Being served now',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// Until triage, a ticket only holds a default department, not the one the
// patient will actually visit, so the department is shown only after routing.
const NOT_ROUTED_YET = ['pending', 'checked_in', 'cancelled'];

const RATING_LABELS = { 1: 'Very poor', 2: 'Poor', 3: 'Okay', 4: 'Good', 5: 'Excellent' };
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

export default function PatientTicketPage() {
  const { ticketNumber } = useParams();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);

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

  // Live updates: refresh on any ticket change, not just this ticket's,
  // because other patients being called or checked out moves this one up.
  useEffect(() => {
    socket.on('ticket:updated', refresh);
    return () => socket.off('ticket:updated', refresh);
  }, [refresh]);

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

  async function handleFeedback() {
    if (!rating) return;
    setSendingFeedback(true);
    setError(null);
    try {
      await api.post(
        `/api/tickets/${ticketNumber}/feedback`,
        { rating, comment: comment.trim() || undefined },
        { auth: false }
      );
      await refresh(); // the ticket now carries the saved feedback
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingFeedback(false);
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
  const routed = !NOT_ROUTED_YET.includes(ticket.status);

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

        {ticket.status !== 'cancelled' && (
          <div className="status-row">
            <span className="status-label">Department</span>
            <span>{routed ? ticket.department?.departmentName : 'Assigned after triage'}</span>
          </div>
        )}

        {ticket.assignment && (
          <>
            <div className="status-row">
              <span className="status-label">Go to</span>
              <span>{ticket.assignment.room || 'Ask at the department desk'}</span>
            </div>
            <div className="status-row">
              <span className="status-label">You will see</span>
              <span>{ticket.assignment.staffName}</span>
            </div>
          </>
        )}

        {ticket.position != null && (
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

        {ticket.status === 'completed' &&
          (ticket.feedback ? (
            <div className="status-row">
              <span className="status-label">Your feedback</span>
              <span>
                {stars(ticket.feedback.rating)} Thank you!
              </span>
            </div>
          ) : (
            <div style={{ marginTop: '1rem' }}>
              <strong>How was your visit?</strong>
              <div role="group" aria-label="Rating" style={{ display: 'flex', gap: '0.25rem', margin: '0.5rem 0' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-pressed={rating === n}
                    aria-label={`${n} out of 5: ${RATING_LABELS[n]}`}
                    style={{
                      width: 'auto',
                      fontSize: '1.5rem',
                      lineHeight: 1,
                      padding: '0.25rem 0.55rem',
                      background: n <= rating ? '#f5b301' : '#fff',
                      color: n <= rating ? '#fff' : '#999',
                      border: '1px solid #ccc',
                    }}
                  >
                    ★
                  </button>
                ))}
              </div>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#666' }}>
                {rating ? RATING_LABELS[rating] : 'Tap a star to rate'}
              </p>
              <label htmlFor="feedbackComment">Comments (optional)</label>
              <textarea
                id="feedbackComment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={500}
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', font: 'inherit', marginBottom: '0.5rem' }}
              />
              <button onClick={handleFeedback} disabled={!rating || sendingFeedback}>
                {sendingFeedback ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          ))}

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
