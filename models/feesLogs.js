const mongoose = require('mongoose');

const feesLogSchema = new mongoose.Schema({
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  feeAmount: { type: Number, required: true, min: 0 }
}, { timestamps: true });

module.exports = mongoose.model('FeesLog', feesLogSchema, 'fees_logs');