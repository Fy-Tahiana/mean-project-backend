const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true },
    images: [{ type: String }],
    status: { type: String, enum: ['active', 'out_of_stock', 'disabled'], default: 'active' }
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
