const express = require('express');
const Record = require('../models/Record');
const Customer = require('../models/Customer');
const AuditLog = require('../models/AuditLog');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { sendSMS } = require('../services/sms');

const router = express.Router();

function createInvoiceNumber() {
  return `MW-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
}

function canonicalPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('0') ? `255${digits.slice(1)}` : digits;
}

function validCustomerPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return /^255\d{9}$/.test(digits) || /^0\d{9}$/.test(digits);
}

function recordSnapshot(record) {
  return {
    customerName: record.customerName,
    phone: record.phone,
    prevReading: record.prevReading,
    currReading: record.currReading,
    units: record.units,
    pricePerUnit: record.pricePerUnit,
    currentBill: record.currentBill,
    previousDebt: record.previousDebt,
    total: record.total,
    status: record.status,
    date: record.date
  };
}

function phoneQuery(value) {
  const canonical = canonicalPhone(value);
  const local = canonical.startsWith('255') ? `0${canonical.slice(3)}` : canonical;
  return { $or: [canonical, local].map(number => ({ phone: new RegExp(`^\\D*${number.split('').join('\\D*')}\\D*$`) })) };
}

function audit(req, action, recordId, metadata = {}) {
  return AuditLog.create({ userId: req.user.userId, action, recordId, metadata }).catch(error => {
    console.error(`Audit log failed (${action}):`, error.message);
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function csvValue(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function recordsCsv(records) {
  const header = ['Invoice', 'Mteja', 'Simu', 'Units', 'Deni la nyuma', 'Jumla', 'Hali', 'Tarehe'];
  const rows = records.map(record => [
    record.invoiceNumber || '',
    record.customerName,
    record.phone,
    record.units,
    record.previousDebt || 0,
    record.total,
    record.status,
    new Date(record.date).toISOString().slice(0, 10)
  ]);
  return [header, ...rows].map(row => row.map(csvValue).join(',')).join('\n');
}

router.use(authMiddleware);

router.get('/customers', async (req, res) => {
  try {
    const [customers, records] = await Promise.all([
      Customer.find().sort({ name: 1 }).lean(),
      Record.find().select('customerName phone').sort({ customerName: 1 }).lean()
    ]);
    const byPhone = new Map();
    const registeredPhones = new Set();
    customers.forEach(customer => {
      const phone = canonicalPhone(customer.phone);
      registeredPhones.add(phone);
      byPhone.set(phone, { ...customer, registered: true });
    });
    records.forEach(record => {
      const phone = canonicalPhone(record.phone);
      if (phone && !registeredPhones.has(phone) && !byPhone.has(phone)) byPhone.set(phone, { _id: '', name: record.customerName, phone: record.phone, openingBalance: 0, registered: false });
    });
    res.json([...byPhone.values()].sort((a, b) => a.name.localeCompare(b.name)));
  } catch (error) {
    res.status(500).json({ message: 'Imeshindikana kupata wateja' });
  }
});

router.post('/send-csv', adminMiddleware, async (req, res) => {
  try {
    const { phone, recordIds } = req.body;
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ message: 'Weka namba ya simu ya kutuma CSV' });
    }

    const query = {};
    if (Array.isArray(recordIds)) query._id = { $in: recordIds };
    const records = await Record.find(query)
      .select('invoiceNumber customerName phone units previousDebt total status date')
      .sort({ date: -1 })
      .lean();
    const csv = recordsCsv(records);

    const result = await sendSMS(phone, csv);
    audit(req, 'sms_sent', undefined, { messageId: result.messageId || result.sid, type: 'csv', to: result.to });
    res.json({ message: 'CSV imetumwa kwa SMS', result });
  } catch (error) {
    console.error('CSV SMS send failed:', error.message);
    const status = error.status === 429 ? 429 : error.code === 'SMS_NOT_CONFIGURED' || error.code === 'SMS_PROVIDER_ERROR' ? 503 : 400;
    res.status(status).json({ message: error.message });
  }
});

router.post('/', adminMiddleware, async (req, res) => {
  try {
    const { customerName, phone, customerId, prevReading, currReading, pricePerUnit, previousDebt, date } = req.body;
    let customer;
    if (customerId) customer = await Customer.findById(customerId);
    if (customerId && !customer) return res.status(404).json({ message: 'Mteja hapatikani' });
    if (customer?.active === false) return res.status(409).json({ message: 'Mteja huyu amezimwa' });
    const resolvedName = customer?.name || customerName;
    const resolvedPhone = customer?.phone || phone;
    if (!resolvedName || !resolvedPhone || prevReading == null || currReading == null || pricePerUnit == null || !date) {
      return res.status(400).json({ message: 'Jaza maeneo yote' });
    }
    if (String(resolvedName).trim().length < 2 || String(resolvedName).trim().length > 100 || !validCustomerPhone(resolvedPhone)) {
      return res.status(400).json({ message: 'Jina au namba ya mteja si sahihi' });
    }
    const customerRecords = await Record.find(phoneQuery(resolvedPhone))
      .select('date previousDebt currentBill total payments')
      .sort({ date: 1, createdAt: 1 })
      .lean();
    const firstRecord = customerRecords[0];
    const approvedPayments = customerRecords.flatMap(record => record.payments || [])
      .filter(payment => payment.status === 'approved')
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const accruedBills = customerRecords.reduce((sum, record) => sum + Number(record.currentBill || Math.max(0, Number(record.total || 0) - Number(record.previousDebt || 0))), 0);
    const arrears = customerRecords.length
      ? Math.max(0, Number(firstRecord?.previousDebt || 0) + accruedBills - approvedPayments)
      : Number(customer?.openingBalance || 0);
    const submittedDebt = arrears;

    const units = Number(currReading) - Number(prevReading);
    if (![prevReading, currReading, pricePerUnit, submittedDebt].every(value => Number.isFinite(Number(value))) || Number(prevReading) < 0 || Number(currReading) < 0 || Number(pricePerUnit) < 0 || Number(submittedDebt) < 0) {
      return res.status(400).json({ message: 'Weka readings na bei sahihi' });
    }
    if (units < 0) return res.status(400).json({ message: 'Usomaji wa sasa ni lazima uwe juu ya wa nyuma' });
    if (Number.isNaN(new Date(date).getTime())) return res.status(400).json({ message: 'Tarehe si sahihi' });

    const currentBill = units * Number(pricePerUnit);
    const total = currentBill + submittedDebt;
    if (!Number.isFinite(currentBill) || !Number.isFinite(total)) return res.status(400).json({ message: 'Jumla ya bili imezidi kiwango kinachoruhusiwa' });
    const record = new Record({
      invoiceNumber: createInvoiceNumber(),
      customerName: resolvedName,
      phone: resolvedPhone,
      prevReading,
      currReading,
      units,
      pricePerUnit,
      previousDebt: submittedDebt,
      currentBill,
      total,
      status: total === 0 ? 'Imelipwa' : 'Haijalipwa',
      date: new Date(date),
      createdBy: req.user.userId
    });

    await record.save();
    audit(req, 'record_created', record._id, { before: null, after: recordSnapshot(record) });
    res.status(201).json(record);
  } catch (error) {
    console.error('Record create failed:', error.message);
    res.status(500).json({ message: 'Hitilafu ya server' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { search, month, year } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { customerName: new RegExp(escapeRegExp(search), 'i') },
        { phone: new RegExp(escapeRegExp(search), 'i') }
      ];
    }

    const expr = [];
    if (month && Number.isInteger(Number(month)) && Number(month) >= 1 && Number(month) <= 12) expr.push({ $eq: [{ $month: '$date' }, Number(month)] });
    if (year && Number.isInteger(Number(year)) && Number(year) >= 2000 && Number(year) <= 2100) expr.push({ $eq: [{ $year: '$date' }, Number(year)] });

    if (expr.length) {
      query.$expr = expr.length === 1 ? expr[0] : { $and: expr };
    }

    const records = await Record.find(query).sort({ date: -1, createdAt: -1 });
    res.json(records);
  } catch (error) {
    console.error('Record list failed:', error.message);
    res.status(500).json({ message: 'Hitilafu ya server' });
  }
});

router.put('/:id', adminMiddleware, async (req, res) => {
  try {
    const { customerName, phone, prevReading, currReading, pricePerUnit, previousDebt = 0, date } = req.body;
    const record = await Record.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Rekodi haipo' });
    const before = recordSnapshot(record);
    if (String(customerName || '').trim().length < 2 || String(customerName || '').trim().length > 100 || !validCustomerPhone(phone)) {
      return res.status(400).json({ message: 'Jina au namba ya mteja si sahihi' });
    }
    const units = Number(currReading) - Number(prevReading);
    if (![prevReading, currReading, pricePerUnit, previousDebt].every(value => Number.isFinite(Number(value))) || Number(prevReading) < 0 || Number(currReading) < 0 || Number(pricePerUnit) < 0 || Number(previousDebt) < 0) {
      return res.status(400).json({ message: 'Weka readings na bei sahihi' });
    }
    if (units < 0) return res.status(400).json({ message: 'Usomaji wa sasa ni lazima uwe juu ya wa nyuma' });

    const currentBill = units * Number(pricePerUnit);
    const total = currentBill + Number(previousDebt);
    if (!Number.isFinite(currentBill) || !Number.isFinite(total)) return res.status(400).json({ message: 'Jumla ya bili imezidi kiwango kinachoruhusiwa' });
    if (Number.isNaN(new Date(date).getTime())) return res.status(400).json({ message: 'Tarehe si sahihi' });
    record.customerName = String(customerName).trim();
    record.phone = String(phone).trim();
    record.prevReading = Number(prevReading);
    record.currReading = Number(currReading);
    record.units = units;
    record.pricePerUnit = Number(pricePerUnit);
    record.previousDebt = Number(previousDebt);
    record.currentBill = currentBill;
    record.total = total;
    record.date = new Date(date);
    const approvedTotal = record.payments.filter(payment => payment.status === 'approved').reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    record.status = approvedTotal >= record.total ? 'Imelipwa' : approvedTotal > 0 ? 'Imelipwa nusu' : 'Haijalipwa';
    await record.save();
    audit(req, 'record_updated', record._id, { before, after: recordSnapshot(record) });
    res.json(record);
  } catch (error) {
    console.error('Record update failed:', error.message);
    res.status(500).json({ message: 'Hitilafu ya server' });
  }
});

router.post('/:id/messages', async (req, res) => {
  try {
    const { message, phone } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ message: 'Weka ujumbe wa SMS' });
    }
    const record = await Record.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Bill haipo' });
    const recipientPhone = phone && String(phone).trim() ? phone : record.phone;
    const result = await sendSMS(recipientPhone, message);
    audit(req, 'sms_sent', record._id, { messageId: result.messageId, to: result.to });
    res.json({ message: 'Ujumbe umetumwa', result });
  } catch (error) {
    console.error('SMS send failed:', error.message);
    const status = error.status === 429 ? 429 : error.code === 'SMS_NOT_CONFIGURED' || error.code === 'SMS_PROVIDER_ERROR' ? 503 : 400;
    res.status(status).json({ message: error.message });
  }
});

router.post('/:id/payments', async (req, res) => {
  try {
    const { amount, reference, note } = req.body;
    const record = await Record.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Bill haipo' });
    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ message: 'Weka kiasi sahihi cha malipo' });
    }
    if (reference && record.payments.some(payment => payment.reference === String(reference).trim())) {
      return res.status(409).json({ message: 'Reference hii imetumika tayari kwenye bill hii' });
    }
    const submittedTotal = record.payments
      .filter(payment => payment.status === 'pending' || payment.status === 'approved')
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const remainingDebt = Math.max(0, Number(record.total || 0) - submittedTotal);
    const duplicatePending = record.payments.some(payment => (
      payment.status === 'pending' && Number(payment.amount || 0) === paymentAmount
    ));
    if (duplicatePending) {
      return res.status(409).json({ message: `Malipo ya TZS ${paymentAmount.toLocaleString('sw-TZ')} tayari yanasubiri idhini ya admin. Deni lililobaki ni TZS ${remainingDebt.toLocaleString('sw-TZ')}.` });
    }
    if (paymentAmount > remainingDebt) {
      return res.status(400).json({ message: `Kiasi kinazidi deni lililobaki. Deni lililobaki ni TZS ${remainingDebt.toLocaleString('sw-TZ')}` });
    }
    const payment = {
      amount: paymentAmount,
      reference,
      note,
      method: 'Manual',
      status: 'pending'
    };
    const before = { status: record.status, payments: record.payments.map(item => ({ amount: item.amount, status: item.status, reference: item.reference })) };
    record.payments.push(payment);
    await record.save();
    audit(req, 'payment_created', record._id, { before, after: { status: record.status, payments: record.payments.map(item => ({ amount: item.amount, status: item.status, reference: item.reference })) } });
    res.status(201).json({ message: 'Malipo yamewasilishwa. Yanasubiri idhini ya admin.', record });
  } catch (error) {
    console.error('Payment create failed:', error.message);
    res.status(500).json({ message: 'Hitilafu ya server' });
  }
});

router.delete('/:id', adminMiddleware, async (req, res) => {
  try {
    const deleted = await Record.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Rekodi haipo' });
    audit(req, 'record_deleted', deleted._id, { before: recordSnapshot(deleted), after: null });
    res.json({ message: 'Rekodi imefutwa' });
  } catch (error) {
    console.error('Record delete failed:', error.message);
    res.status(500).json({ message: 'Hitilafu ya server' });
  }
});

module.exports = router;
