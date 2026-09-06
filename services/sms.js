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
  return Boolean(tapsaApiKey());
}

function tapsaApiKey() {
  return String(process.env.TAPSA_API_KEY || process.env.TAPSA_API_TOKEN || '').trim();
}

let tapsaClientPromise;

async function tapsaClient() {
  if (!tapsaClientPromise) {
    tapsaClientPromise = import('sms-bulk-tz').then(({ TapsaSMS }) => new TapsaSMS({
      apiKey: tapsaApiKey(),
      baseUrl: process.env.TAPSA_BASE_URL || 'https://api.smstapsa.site',
      timeout: 30000
    }));
  }
  return tapsaClientPromise;
}

async function sendWithTapsa(phone, body) {
  try {
    const result = await (await tapsaClient()).sendSMS({
      phoneNumbers: [normalizePhone(phone).slice(1)],
      message: String(body),
      ...(process.env.TAPSA_SENDER_ID?.trim() ? { senderId: process.env.TAPSA_SENDER_ID.trim() } : {})
    });
    const recipient = result.recipients?.[0] || result.data?.recipients?.[0];
    return {
      messageId: recipient?.messageId || result.data?.messageId,
      to: recipient?.number || normalizePhone(phone),
      remainingBalance: result.remainingBalance ?? result.data?.remainingBalance
    };
  } catch (cause) {
    const error = new Error(cause?.message || 'TAPSA imeshindwa kutuma SMS.');
    error.code = 'SMS_PROVIDER_ERROR';
    error.cause = cause;
    throw error;
  }
}

function twilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

async function smsStatus() {
  const provider = tapsaConfigured() ? 'TAPSA' : twilioConfigured() ? 'Twilio' : null;
  if (!provider) return { provider: null, configured: false, online: false, message: 'SMS API haijawekwa' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    if (provider === 'TAPSA') {
      const balance = await (await tapsaClient()).getBalance();
      return { provider, configured: true, online: true, message: 'TAPSA inapatikana', balance: balance.data?.balance, currency: balance.data?.currency };
    }
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}.json`;
    const options = { method: 'GET', signal: controller.signal };
    if (provider === 'Twilio') {
      options.headers = {
        Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`
      };
    }
    const response = await fetch(url, options);
    const online = response.ok;
    return {
      provider,
      configured: true,
      online,
      message: online ? `${provider} inapatikana` : `${provider} imekataa API key (${response.status})`,
      status: response.status
    };
  } catch (error) {
    return { provider, configured: true, online: false, message: `${provider} haipatikani` };
  } finally {
    clearTimeout(timeout);
  }
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
    Body: String(body)
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

module.exports = { sendSMS, normalizePhone, smsConfigured, smsStatus };
