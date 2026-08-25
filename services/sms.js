function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('255')) return `+${digits}`;
  if (digits.startsWith('0')) return `+255${digits.slice(1)}`;
  return `+${digits}`;
}

function smsConfigured() {
  return Boolean(tapsaApiKey() || (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  ));
}

function tapsaConfigured() {
  return Boolean(tapsaApiKey() && process.env.TAPSA_SENDER_ID?.trim());
}

function tapsaApiKey() {
  return String(process.env.TAPSA_API_KEY || process.env.TAPSA_API_TOKEN || '').trim();
}

async function sendWithTapsa(phone, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch('https://api.smstapsa.site/v1/sms/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': tapsaApiKey()
    },
    body: JSON.stringify({
      phoneNumbers: [normalizePhone(phone).slice(1)],
      message: String(body).slice(0, 1600),
      senderId: process.env.TAPSA_SENDER_ID.trim()
    }),
    signal: controller.signal
  });
  clearTimeout(timeout);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const error = new Error(data.message || 'TAPSA imeshindwa kutuma SMS.');
    error.code = 'SMS_PROVIDER_ERROR';
    throw error;
  }
  return { messageId: data.data?.messageId, to: normalizePhone(phone) };
}

function twilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

async function sendSMS(phone, body) {
  const to = normalizePhone(phone);
  if (!to || !/^\+\d{10,15}$/.test(to)) {
    const error = new Error('Namba ya simu si sahihi. Tumia mfano 0712345678.');
    error.code = 'INVALID_PHONE';
    throw error;
  }

  if (tapsaConfigured()) return sendWithTapsa(phone, body);

  if (!twilioConfigured()) {
    const error = new Error('SMS API haijawekwa.');
    error.code = 'SMS_NOT_CONFIGURED';
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
