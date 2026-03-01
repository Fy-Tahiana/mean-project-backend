const mongoose = require('mongoose');

// Define the Fees schema by following this field structure name, rate, threshold, fixed, status (type: active | inactive)
const paymentSchema = new mongoose.Schema({
    name: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);