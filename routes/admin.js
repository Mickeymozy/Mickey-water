const express = require('express');
const Record = require('../models/Record');
const User = require('../models/User');
const Customer = require('../models/Customer');
const RefreshToken = require('../models/RefreshToken');
const AuditLog = require('../models/AuditLog');
const { adminMiddleware } = require('../middleware/auth');
const { sendSMS } = require('../services/sms');
const bcrypt = require('bcryptjs');

const router = express.Router();
router.use(adminMiddleware);

function audit(req, action, recordId, metadata = {}) {
  return AuditLog.create({ userId: req.user.userId, action, recordId, metadata }).catch(error => {
    console.error(`Audit log failed (${action}):`, error.message);
  });
}

function csvValue(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function recordsCsv(records) {
  const header = ['Invoice', 'Mteja', 'Simu', 'Units', 'Deni la nyuma', 'Jumla', 'Hali', 'Tarehe'];
  const rows = records.map(record => [
    record.invoiceNumber || '', record.customerName, record.phone, record.units,
    record.previousDebt || 0, record.total, record.status,
    new Date(record.date).toISOString().slice(0, 10)
  ]);
  return [header, ...rows].map(row => row.map(csvValue).join(',')).join('\n');
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('255')) return digits;
  if (digits.startsWith('0')) return `255${digits.slice(1)}`;
  return digits;
}

function phoneQuery(value) {
  const canonical = normalizePhone(value);
  const local = canonical.startsWith('255') ? `0${canonical.slice(3)}` : canonical;
  return { $or: [canonical, local].map(number => ({ phone: new RegExp(`^\\D*${number.split('').join('\\D*')}\\D*$`) })) };
}

router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('name email role createdAt').sort({ createdAt: -1 }).lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Imeshindikana kupata watumiaji' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (name.length < 2 || name.length > 100 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      return res.status(400).json({ message: 'Weka jina, email sahihi na nywila yenye angalau herufi 8' });
    }
    if (await User.exists({ email })) return res.status(409).json({ message: 'Email tayari imetumika' });
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12), role: 'user' });
    audit(req, 'user_created', undefined, { email: user.email });
    res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt });
  } catch (error) {
    res.status(500).json({ message: 'Imeshindikana kuongeza mtumiaji' });
  }
});

router.patch('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Mtumiaji hapatikani' });
    if (user.email === 'mickidadyhamza@gmail.com') return res.status(403).json({ message: 'Akaunti kuu ya admin haiwezi kuhaririwa hapa' });
    const name = String(req.body.name ?? user.name).trim();
    const email = String(req.body.email ?? user.email).trim().toLowerCase();
    const password = String(req.body.password || '');
    if (name.length < 2 || name.length > 100 || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Jina au email si sahihi' });
    if (await User.exists({ email, _id: { $ne: user._id } })) return res.status(409).json({ message: 'Email tayari imetumika' });
    if (password && password.length < 8) return res.status(400).json({ message: 'Nywila iwe na angalau herufi 8' });
    user.name = name;
    user.email = email;
    user.role = 'user';
    if (password) user.password = await bcrypt.hash(password, 12);
    await user.save();
    if (password || req.body.email) await RefreshToken.deleteMany({ userId: user._id });
    audit(req, 'user_updated', undefined, { email: user.email });
    res.json({ _id: user._id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt });
  } catch (error) {
    res.status(500).json({ message: 'Imeshindikana kuhariri mtumiaji' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Mtumiaji hapatikani' });
    if (user.email === 'mickidadyhamza@gmail.com' || String(user._id) === String(req.user.userId)) return res.status(403).json({ message: 'Akaunti hii haiwezi kufutwa' });
    await Record.updateMany({ createdBy: user._id }, { createdBy: req.user.userId });
    await RefreshToken.deleteMany({ userId: user._id });
    await User.deleteOne({ _id: user._id });
    audit(req, 'user_deleted', undefined, { email: user.email });
    res.json({ message: 'Mtumiaji amefutwa; rekodi zake zimehifadhiwa' });
  } catch (error) {
    res.status(500).json({ message: 'Imeshindikana kufuta mtumiaji' });
  }
});

router.get('/customers', async (req, res) => {
  try {
    const customers = await Customer.find().sort({ name: 1 }).lean();
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: 'Imeshindikana kupata wateja' });
  }
});

router.post('/customers', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const phone = normalizePhone(req.body.phone);
    const openingBalance = Number(req.body.openingBalance || 0);
    if (name.length < 2 || name.length > 100 || !/^255\d{9}$/.test(phone) || !Number.isFinite(openingBalance) || openingBalance < 0) {
      return res.status(400).json({ message: 'Weka jina, namba ya Tanzania na salio la mwanzo sahihi' });
    }
    if (await Customer.exists({ phone })) return res.status(409).json({ message: 'Namba hii tayari imesajiliwa' });
    const customer = await Customer.create({ name, phone, openingBalance, createdBy: req.user.userId });
    audit(req, 'customer_created', undefined, { customerId: String(customer._id), phone });
    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Imeshindikana kuongeza mteja' });
  }
});

router.patch('/customers/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Mteja hapatikani' });
    const name = String(req.body.name ?? customer.name).trim();
    const phone = normalizePhone(req.body.phone ?? customer.phone);
    const openingBalance = Number(req.body.openingBalance ?? customer.openingBalance ?? 0);
    if (name.length < 2 || name.length > 100 || !/^255\d{9}$/.test(phone) || !Number.isFinite(openingBalance) || openingBalance < 0) {
      return res.status(400).json({ message: 'Taarifa za mteja si sahihi' });
    }
    if (await Customer.exists({ phone, _id: { $ne: customer._id } })) return res.status(409).json({ message: 'Namba hii tayari imesajiliwa' });
    if (Number(openingBalance) !== Number(customer.openingBalance || 0)) {
      const hasBills = await Record.exists(phoneQuery(customer.phone));
      if (hasBills) return res.status(409).json({ message: 'Salio la mwanzo haliwezi kubadilishwa baada ya kutengeneza bili' });
    }
    const previousPhone = customer.phone;
    customer.name = name;
    customer.phone = phone;
    customer.openingBalance = openingBalance;
    if (typeof req.body.active === 'boolean') customer.active = req.body.active;
    customer.updatedAt = new Date();
    await customer.save();
    await Record.updateMany(phoneQuery(previousPhone), { customerName: name, phone });
    audit(req, 'customer_updated', undefined, { customerId: String(customer._id), phone });
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Imeshindikana kuhariri mteja' });
  }
});

router.delete('/customers/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Mteja hapatikani' });
    customer.active = false;
    await customer.save();
    audit(req, 'customer_deactivated', undefined, { customerId: String(customer._id), hadBills: Boolean(await Record.exists(phoneQuery(customer.phone))) });
    res.json({ message: 'Mteja amezimwa; historia ya bili imehifadhiwa' });
  } catch (error) {
    res.status(500).json({ message: 'Imeshindikana kufuta mteja' });
  }
});

router.post('/send-csv', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ message: 'Weka namba ya simu ya kutuma CSV' });
    }
    const records = await Record.find()
      .select('invoiceNumber customerName phone units previousDebt total status date')
      .sort({ date: -1 })
      .lean();
    const csv = recordsCsv(records);
    const result = await sendSMS(phone, csv);
    audit(req, 'sms_sent', undefined, { messageId: result.messageId || result.sid, type: 'admin_csv', to: result.to });
    res.json({ message: 'CSV ya mfumo imetumwa kwa SMS', result });
  } catch (error) {
    console.error('Admin CSV SMS send failed:', error.message);
    const status = error.status === 429 ? 429 : error.code === 'SMS_NOT_CONFIGURED' || error.code === 'SMS_PROVIDER_ERROR' ? 503 : 400;
    res.status(status).json({ message: error.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const [records, users, pendingPayments] = await Promise.all([
      Record.find().select('total status payments date customerName phone invoiceNumber createdBy').sort({ date: -1 }),
      User.countDocuments(),
      Record.countDocuments({ 'payments.status': 'pending' })
    ]);
    const approvedPayments = records.flatMap(record => record.payments.filter(payment => payment.status === 'approved'));
    res.json({
      users,
      bills: records.length,
      unpaidBills: records.filter(record => record.status !== 'Imelipwa').length,
      totalBilled: records.reduce((sum, record) => sum + record.total, 0),
      totalCollected: approvedPayments.reduce((sum, payment) => sum + payment.amount, 0),
      pendingPayments,
      records
    });
  } catch (error) {
    console.error('Admin summary failed:', error.message);
    res.status(500).json({ message: 'Imeshindikana kupata muhtasari' });
  }
});

router.get('/payments/pending', async (req, res) => {
  try {
    const records = await Record.find({ 'payments.status': 'pending' }).populate('createdBy', 'name email').sort({ updatedAt: -1 });
    res.json(records.flatMap(record => record.payments
      .filter(payment => payment.status === 'pending')
      .map(payment => ({ record, payment }))));
  } catch (error) {
    console.error('Pending payments failed:', error.message);
    res.status(500).json({ message: 'Imeshindikana kupata malipo yanayosubiri' });
  }
});

router.patch('/payments/:recordId/:paymentId/approve', async (req, res) => {
  try {
    const record = await Record.findById(req.params.recordId);
    if (!record) return res.status(404).json({ message: 'Bill haipo' });
    const payment = record.payments.id(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'Malipo hayapo' });
    if (payment.status !== 'pending') return res.status(409).json({ message: 'Malipo hayawezi kuidhinishwa tena' });

    payment.status = 'approved';
    payment.approvedAt = new Date();
    payment.approvedBy = req.user.userId;
    payment.receiptNumber = `MW-${Date.now().toString(36).toUpperCase()}`;
    const approvedTotal = record.payments
      .filter(item => item.status === 'approved')
      .reduce((sum, item) => sum + item.amount, 0);
    record.status = approvedTotal >= record.total ? 'Imelipwa' : approvedTotal > 0 ? 'Imelipwa nusu' : 'Haijalipwa';
    await record.save();
    audit(req, 'payment_approved', record._id, { amount: payment.amount, receiptNumber: payment.receiptNumber });
    res.json({ message: record.status === 'Imelipwa' ? 'Malipo yamekamilika na risiti imetengenezwa' : 'Malipo ya sehemu yameidhinishwa, deni bado lipo', record });
  } catch (error) {
    console.error('Payment approval failed:', error.message);
    res.status(500).json({ message: 'Imeshindikana kuidhinisha malipo' });
  }
});

router.patch('/payments/:recordId/:paymentId/reject', async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ message: 'Weka sababu ya kukataa malipo' });
    const record = await Record.findById(req.params.recordId);
    if (!record) return res.status(404).json({ message: 'Bill haipo' });
    const payment = record.payments.id(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: 'Malipo hayapo' });
    if (payment.status !== 'pending') return res.status(409).json({ message: 'Malipo hayawezi kukataliwa tena' });

    payment.status = 'rejected';
    payment.rejectionReason = reason;
    await record.save();
    audit(req, 'payment_rejected', record._id, { amount: payment.amount, reason });
    res.json({ message: 'Malipo yamekataliwa', record });
  } catch (error) {
    console.error('Payment rejection failed:', error.message);
    res.status(500).json({ message: 'Imeshindikana kukataa malipo' });
  }
});

module.exports = router;
