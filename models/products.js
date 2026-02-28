const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true, minlength: 2 },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0 },
    description: { type: String, default: '', required: false },
    images: [{ type: String }],
    status: { type: String, enum: ['active', 'out_of_stock', 'disabled'], default: 'active' }
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
