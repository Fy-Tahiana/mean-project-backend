const mongoose = require('mongoose');

// Define the Fees schema by following this field structure name, rate, threshold, fixed, status (type: active | inactive)
const feesSchema = new mongoose.Schema({
    name: { type: String, required: true },
    rate: { type: Number, required: true, min: 0 },
    threshold: { type: Number, required: true, min: 0 },
    fixed: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
}, { timestamps: true });

// Guarantee at most one ACTIVE fee
feesSchema.index(
  { status: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } }
);

module.exports = mongoose.model('Fees', feesSchema);