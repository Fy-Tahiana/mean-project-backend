const express = require('express');
const router = express.Router();
const fs = require('fs');
const mongoose = require('mongoose');

const upload = require('../../middlewares/upload');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requirerole');
const Shop = require('../../models/shops');


//create a new shop
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

//get shop by id
router.get('/:id', async (req, res) => {
    try {
        //convert id to ObjectId
        const shop = await Shop.findById(new mongoose.Types.ObjectId(req.params.id));
        if (!shop) {
            return res.status(404).json({ error: 'Shop not found' });
        }
        res.status(200).json({ shop });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch shop', details: error.message });
    }
});

//get shops with query ?status=active&categoryId=&q=&page=
router.get('/', async (req, res) => {
    try {
        const filter = {};
        filter.status = 'ACTIVE';
        if (req.query.status) {
            filter.status = req.query.status.toUpperCase();
        }
        if (req.query.categoryId) {
            filter.categoryId = req.query.categoryId;
        }
        if (req.query.q) {
            filter.name = { $regex: req.query.q, $options: 'i' };
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const shops = await Shop.find(filter).skip(skip).limit(limit);
        res.status(200).json({ shops, page });

    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch shops', details: error.message });
    }
});


module.exports = router;