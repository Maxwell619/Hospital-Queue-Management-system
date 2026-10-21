// Sends SMS through Africa's Talking's REST API.
// .env:
//   AT_USERNAME   "sandbox" while testing, your app username when live
//   AT_API_KEY    the API key from the same app (Settings -> API Key)
//   AT_SANDBOX    "true" to use the sandbox host (omit when live)
//   AT_SENDER_ID  optional alphanumeric sender name (live accounts only)

// Patients are stored as 07XXXXXXXX; the gateway wants +2547XXXXXXXX.
function toInternational(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.startsWith('254') && digits.length === 12) return `+${digits}`;
    if (digits.startsWith('0') && digits.length === 10) return `+254${digits.slice(1)}`;
    if (digits.length === 9) return `+254${digits}`;
    return null;
  }
  
  // Never throws. Returns { ok, skipped?, error? } so callers can log the outcome
  // without a gateway problem ever breaking a registration or check-in.
  async function sendSms(phone, message) {
    const username = process.env.AT_USERNAME;
    const apiKey = process.env.AT_API_KEY;
    if (!username || !apiKey) {
      console.warn('SMS skipped: set AT_USERNAME and AT_API_KEY in .env');
      return { ok: false, skipped: true };
    }
  
    const to = toInternational(phone);
    if (!to) return { ok: false, error: `Unrecognised phone number "${phone}"` };
  
    const host =
      process.env.AT_SANDBOX === 'true' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
    const body = new URLSearchParams({ username, to, message });
    if (process.env.AT_SENDER_ID) body.set('from', process.env.AT_SENDER_ID);
  
    try {
      const res = await fetch(`https://${host}/version1/messaging`, {
        method: 'POST',
        headers: {
          apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(10000),
      });
      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        /* non-JSON error page */
      }
  
      const recipient = data?.SMSMessageData?.Recipients?.[0];
      const ok =
        res.ok &&
        (recipient?.status === 'Success' || [100, 101, 102].includes(Number(recipient?.statusCode)));
      if (!ok) console.error(`SMS to ${to} failed (HTTP ${res.status}):`, text.slice(0, 300));
      return ok ? { ok: true } : { ok: false, error: recipient?.status || `HTTP ${res.status}` };
    } catch (err) {
      console.error(`SMS to ${to} failed:`, err.message);
      return { ok: false, error: err.message };
    }
  }
  
  module.exports = { sendSms, toInternational };