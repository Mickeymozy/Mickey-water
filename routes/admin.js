const express = require('express');
const Record = require('../models/Record');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { adminMiddleware } = require('../middleware/auth');
const { sendSMS } = require('../services/sms');

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
    if (csv.length > 160) {
      return res.status(400).json({ message: 'SMSTAPSA inaruhusu herufi 160 kwa ujumbe. Punguza records kabla ya kutuma.' });
    }
    const result = await sendSMS(phone, csv);
    audit(req, 'sms_sent', undefined, { messageId: result.messageId || result.sid, type: 'admin_csv', to: result.to });
    res.json({ message: 'CSV ya mfumo imetumwa kwa SMS', result });
  } catch (error) {
    console.error('Admin CSV SMS send failed:', error.message);
    const status = error.code === 'SMS_NOT_CONFIGURED' || error.code === 'SMS_PROVIDER_ERROR' ? 503 : 400;
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
    record.status = approvedTotal >= record.total ? 'Imelipwa' : 'Haijalipwa';
    await record.save();
    audit(req, 'payment_approved', record._id, { amount: payment.amount, receiptNumber: payment.receiptNumber });
    res.json({ message: 'Malipo yameidhinishwa na risiti imetengenezwa', record });
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
