const express = require('express');
const Record = require('../models/Record');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.use(authMiddleware);

router.post('/', async (req, res) => {
  try {
    const { customerName, phone, prevReading, currReading, pricePerUnit, previousDebt = 0, date } = req.body;
    if (!customerName || !phone || prevReading == null || currReading == null || pricePerUnit == null || !date) {
      return res.status(400).json({ message: 'Jaza maeneo yote' });
    }

    const units = Number(currReading) - Number(prevReading);
    if (![prevReading, currReading, pricePerUnit, previousDebt].every(value => Number.isFinite(Number(value))) || Number(pricePerUnit) < 0 || Number(previousDebt) < 0) {
      return res.status(400).json({ message: 'Weka readings na bei sahihi' });
    }
    if (units < 0) return res.status(400).json({ message: 'Usomaji wa sasa ni lazima uwe juu ya wa nyuma' });
    if (Number.isNaN(new Date(date).getTime())) return res.status(400).json({ message: 'Tarehe si sahihi' });

    const currentBill = units * Number(pricePerUnit);
    const total = currentBill + Number(previousDebt);
    const record = new Record({
      customerName,
      phone,
      prevReading,
      currReading,
      units,
      pricePerUnit,
      previousDebt: Number(previousDebt),
      currentBill,
      total,
      status: 'Haijalipwa',
      date: new Date(date),
      createdBy: req.user.userId
    });

    await record.save();
    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ message: 'Hitilafu ya server' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { search, month, year } = req.query;
    const query = { createdBy: req.user.userId };

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
    res.status(500).json({ message: 'Hitilafu ya server' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { customerName, phone, prevReading, currReading, pricePerUnit, previousDebt = 0, date } = req.body;
    const units = Number(currReading) - Number(prevReading);
    if (![prevReading, currReading, pricePerUnit, previousDebt].every(value => Number.isFinite(Number(value))) || Number(pricePerUnit) < 0 || Number(previousDebt) < 0) {
      return res.status(400).json({ message: 'Weka readings na bei sahihi' });
    }
    if (units < 0) return res.status(400).json({ message: 'Usomaji wa sasa ni lazima uwe juu ya wa nyuma' });

    const currentBill = units * Number(pricePerUnit);
    const total = currentBill + Number(previousDebt);
    if (Number.isNaN(new Date(date).getTime())) return res.status(400).json({ message: 'Tarehe si sahihi' });
    const updated = await Record.findOneAndUpdate({ _id: req.params.id, createdBy: req.user.userId }, {
      customerName,
      phone,
      prevReading,
      currReading,
      units,
      pricePerUnit,
      previousDebt: Number(previousDebt),
      currentBill,
      total,
      date: new Date(date),
      updatedAt: Date.now()
    }, { new: true, runValidators: true });

    if (!updated) return res.status(404).json({ message: 'Rekodi haipo' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Hitilafu ya server' });
  }
});

router.post('/:id/payments', async (req, res) => {
  try {
    const { amount, reference, note } = req.body;
    const record = await Record.findOne({ _id: req.params.id, createdBy: req.user.userId });
    if (!record) return res.status(404).json({ message: 'Bill haipo' });
    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ message: 'Weka kiasi sahihi cha malipo' });
    }
    if (reference && record.payments.some(payment => payment.reference === String(reference).trim())) {
      return res.status(409).json({ message: 'Reference hii imetumika tayari kwenye bill hii' });
    }
    const approvedTotal = record.payments
      .filter(payment => payment.status === 'approved')
      .reduce((sum, payment) => sum + payment.amount, 0);
    if (approvedTotal + paymentAmount > record.total) {
      return res.status(400).json({ message: 'Kiasi kinazidi deni lililobaki' });
    }
    const payment = {
      amount: paymentAmount,
      reference,
      note,
      method: 'Manual',
      status: 'approved',
      approvedAt: new Date(),
      receiptNumber: `MW-${Date.now().toString(36).toUpperCase()}`
    };
    record.payments.push(payment);
    record.status = approvedTotal + paymentAmount >= record.total ? 'Imelipwa' : 'Haijalipwa';
    await record.save();
    res.status(201).json({ message: record.status === 'Imelipwa' ? 'Malipo yamehifadhiwa. Risiti iko tayari.' : 'Malipo yamehifadhiwa.', record });
  } catch (error) {
    res.status(500).json({ message: 'Hitilafu ya server' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Record.findOneAndDelete({ _id: req.params.id, createdBy: req.user.userId });
    if (!deleted) return res.status(404).json({ message: 'Rekodi haipo' });
    res.json({ message: 'Rekodi imefutwa' });
  } catch (error) {
    res.status(500).json({ message: 'Hitilafu ya server' });
  }
});

module.exports = router;
