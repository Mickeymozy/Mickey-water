const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ['Manual'], default: 'Manual' },
  reference: { type: String, trim: true },
  note: { type: String, trim: true, maxlength: 500 },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  rejectionReason: { type: String, trim: true, maxlength: 300 },
  receiptNumber: { type: String, trim: true },
  submittedAt: { type: Date, default: Date.now },
  approvedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: true });

const recordSchema = new mongoose.Schema({
  invoiceNumber: { type: String, unique: true, sparse: true, trim: true },
  customerName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  prevReading: { type: Number, required: true },
  currReading: { type: Number, required: true },
  units: { type: Number, required: true },
  pricePerUnit: { type: Number, required: true },
  previousDebt: { type: Number, required: true, min: 0, default: 0 },
  currentBill: { type: Number, required: true, min: 0, default: 0 },
  total: { type: Number, required: true },
  status: { type: String, enum: ['Haijalipwa', 'Imelipwa'], default: 'Haijalipwa' },
  payments: { type: [paymentSchema], default: [] },
  date: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

recordSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

recordSchema.index({ createdBy: 1, date: -1, createdAt: -1 });
recordSchema.index({ 'payments.status': 1, date: -1 });

module.exports = mongoose.model('Record', recordSchema);
