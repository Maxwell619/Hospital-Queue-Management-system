import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { addTicket } from '../components/TicketHistory';

export default function PatientRegisterPage() {
  const [serviceTypes, setServiceTypes] = useState([]);
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    patientName: '',
    phoneNumber: '',
    dateOfBirth: '',
    nationalId: '',
    serviceId: '',
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get('/api/service-types', { auth: false })
      .then((types) => {
        setServiceTypes(types);
        if (types.length > 0) {
          setForm((f) => ({ ...f, serviceId: String(types[0].serviceId) }));
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const ticket = await api.post(
        '/api/tickets',
        {
          patientName: form.patientName,
          phoneNumber: form.phoneNumber,
          dateOfBirth: form.dateOfBirth || undefined,
          nationalId: form.nationalId || undefined,
          serviceId: Number(form.serviceId),
          channel: 'web',
        },
        { auth: false }
      );

      // Remember this ticket so the sidebar can show a button for it.
      // Must run before navigate() so the sidebar sees it on the ticket page.
      addTicket(ticket.ticketNumber);

      navigate(`/ticket/${ticket.ticketNumber}`);
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
        <p className="subtitle">Register and get a ticket</p>

        <label htmlFor="patientName">Full name</label>
        <input id="patientName" value={form.patientName} onChange={update('patientName')} required />

        <label htmlFor="phoneNumber">Phone number</label>
        <input
          id="phoneNumber"
          value={form.phoneNumber}
          onChange={update('phoneNumber')}
          required
          minLength={10}
          maxLength={10}
        />

        <label htmlFor="dateOfBirth">Date of birth </label>
        <input
          id="dateOfBirth"
          type="date"
          value={form.dateOfBirth}
          onChange={update('dateOfBirth')}
          max={today}
        />

        <label htmlFor="nationalId">National ID (optional)</label>
        <input
          id="nationalId"
          value={form.nationalId}
          onChange={update('nationalId')}
          maxLength={8}
        />

        <label htmlFor="serviceId">Service</label>
        <select id="serviceId" value={form.serviceId} onChange={update('serviceId')} required>
          {serviceTypes.map((s) => (
            <option key={s.serviceId} value={s.serviceId}>
              {s.serviceName}
            </option>
          ))}
        </select>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={submitting || serviceTypes.length === 0}>
          {submitting ? 'Submitting…' : 'Get ticket'}
        </button>
      </form>
    </div>
  );
}
