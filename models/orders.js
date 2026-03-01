const mongoose = require('mongoose');

// Define the order schema with fields : buyerId, items[{productId, qty, priceSnapshot}], total, status, address, phone, createdAt (status: pending | confirmed | preparing | ready | delivered | cancelled payment.status: unpaid | paid | refunded)

const orderSchema = new mongoose.Schema({
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        qty: { type: Number, required: true },
        priceSnapshot: { type: Number, required: true }
    }],
    total: { type: Number, required: true },  
    status: { type: String, enum: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'], default: 'PENDING' },
    address: { type: String, required: true },
    phone: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);