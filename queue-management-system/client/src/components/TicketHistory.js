// Remembers the tickets registered in this browser so the sidebar can show a
// button for each one. Newest first, capped so the sidebar doesn't grow forever.
const KEY = 'queueTicketNumbers';
const MAX_TICKETS = 5;

export function getTickets() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function addTicket(ticketNumber) {
  const n = Number(ticketNumber);
  if (!Number.isInteger(n)) return;
  const list = [n, ...getTickets().filter((t) => t !== n)].slice(0, MAX_TICKETS);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable (private mode, quota): the sidebar just won't list it */
  }
}