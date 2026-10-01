const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true, enum: ['record_created', 'record_updated', 'record_deleted', 'payment_created', 'payment_approved', 'payment_rejected', 'sms_sent', 'account_deleted', 'user_created', 'user_updated', 'user_deactivated', 'user_deleted', 'customer_created', 'customer_updated', 'customer_deactivated'] },
  recordId: { type: mongoose.Schema.Types.ObjectId, ref: 'Record' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

auditLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);