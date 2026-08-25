function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('255')) return `+${digits}`;
  if (digits.startsWith('0')) return `+255${digits.slice(1)}`;
  return `+${digits}`;
}

function smsConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

async function sendSMS(phone, body) {
  if (!smsConfigured()) {
    const error = new Error('SMS haijawekwa. Weka TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN na TWILIO_PHONE_NUMBER.');
    error.code = 'SMS_NOT_CONFIGURED';
    throw error;
  }

  const to = normalizePhone(phone);
  if (!to || !/^\+\d{10,15}$/.test(to)) {
    const error = new Error('Namba ya simu si sahihi. Tumia mfano 0712345678.');
    error.code = 'INVALID_PHONE';
    throw error;
  }

  const credentials = Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
  ).toString('base64');
  const params = new URLSearchParams({
    To: to,
    From: process.env.TWILIO_PHONE_NUMBER,
    Body: String(body).slice(0, 1600)
  });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Twilio imeshindwa kutuma SMS.');
    error.code = 'SMS_PROVIDER_ERROR';
    throw error;
  }

  return { sid: data.sid, to };
}

module.exports = { sendSMS, normalizePhone, smsConfigured };
