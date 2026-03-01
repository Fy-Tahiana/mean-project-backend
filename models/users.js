const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    role: { type: String, enum: ['ADMIN', 'SHOP', 'BUYER'], required: true },
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    passwordHash: { type: String, required: true },
    status : { type: String, enum: ['active', 'banned'], default: 'active' }

}, { timestamps: true});

module.exports = mongoose.model('User', userSchema);