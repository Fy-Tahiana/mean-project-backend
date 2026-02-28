const mongoose = require('mongoose');

// Define the Shop schema by following this field structure name, slug, categoryId, status, ownerUserId, description?, logoUrl?, coverUrl?, contact{phone,email?,address?}, location{city?,lat?,lng?}?, openingHours?, socials{facebook?,instagram?,website?}?, createdAt, updatedAt
const shopSchema = new mongoose.Schema({
    name: { type: String, required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    status: { type: String, enum: ['ACTIVE', 'PENDING', 'REJECTED', 'SUSPENDED'], default: 'PENDING' },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String },
    logoUrl: { type: String },
    coverUrl: { type: String },
    contact: {
        phone: { type: String, required: true },
        email: { type: String },
        address: { type: String }
    },
    openingHours: { type: String },
    socials: {
        facebook: { type: String },
        instagram: { type: String },
        website: { type: String }
    },
}, { timestamps: true });

module.exports = mongoose.model('Shop', shopSchema);