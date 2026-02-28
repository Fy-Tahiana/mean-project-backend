const express = require('express');
const router = express.Router();
const fs = require('fs');

const upload = require('../../middlewares/upload');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requirerole');
const Shop = require('../../models/shops');



router.post('/', auth, requireRole('SHOP'), upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), 
    async (req, res) => {

    try {
        const logo = req.files.logo?.[0];
        const cover = req.files.cover?.[0];

        const shop = new Shop({
            name: req.body.name,
            description: req.body.description,
            logoUrl: logo ? logo.path : "uploads\\shops\\logos\\default.png",
            coverUrl: cover ? cover.path : null,
            contact: {
                phone: req.body.phone,
                email: req.body.email,
                address: req.body.address
            },
            ownerUserId: req.user?.id,
            categoryId: req.body.categoryId,
            openingHours: req.body.openingHours,
            socials: {
                facebook: req.body.facebook,
                instagram: req.body.instagram,
                website: req.body.website
            }
        });
        await shop.save();
        res.status(201).json({ message: 'Shop created successfully', shop });
        
    } catch (error) {
        //delete uploaded files in case of error
        if (req.files.logo) {
            req.files.logo.forEach(file => {
                fs.unlink(file.path, (err) => {
                    if (err) console.error('Failed to delete logo file:', err);
                });
            });
        }
        if (req.files.cover) {
            req.files.cover.forEach(file => {
                fs.unlink(file.path, (err) => {
                    if (err) console.error('Failed to delete cover file:', err);
                });
            });
        }
        res.status(500).json({ error: 'Failed to create shop', details: error.message });
        
    }
});



module.exports = router;