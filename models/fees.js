const mongoose = require('mongoose');

// Define the Fees schema by following this field structure name, rate, threshold, fixed, status (type: active | inactive)
const feesSchema = new mongoose.Schema({
    name: { type: String, required: true },
    rate: { type: Number, required: true },
    threshold: { type: Number, required: true },
    fixed: { type: Number, required: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
}, { timestamps: true });

module.exports = mongoose.model('Fees', feesSchema);