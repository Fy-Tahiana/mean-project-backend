const mongoose = require('mongoose');


// Define the Category schema by following this field structure name, type, isActive (type: shop | product)
const categorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, enum: ['SHOP', 'PRODUCT'], required: true },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);