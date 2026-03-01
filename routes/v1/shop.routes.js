const express = require('express');
const router = express.Router();
const fs = require('fs');
const mongoose = require('mongoose');

const upload = require('../../middlewares/upload');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requirerole');
const Shop = require('../../models/shops');
const requireOwner = require('../../middlewares/requireOwner');
const requireOwnerShop = require('../../middlewares/requireOwnerShop');
const Product = require('../../models/products');
const Order = require('../../models/orders');


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
        let newShop =await shop.save();

        //update cookies of the user to include the new shopId if role is SHOP
        if(req.user.role.toUpperCase() === 'SHOP'){
            const updatedShops = [...req.user.shops, newShop._id.toString()];
            const accessToken = require('../../utils/jwt').signAccessToken(req.user, updatedShops);
            res.cookie('authorization', accessToken, {
                httpOnly: true,
                secure: true,
                sameSite: 'Strict',
                maxAge: 24 * 60 * 60 * 1000 // 1 day
            });
        }
        res.status(201).json({ message: 'Shop created successfully', shop });
        
    } catch (error) {
        console.error('Error creating shop:', error);
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


// Get top 5 products by quantity sold for a shop ✅
router.get('/:shopId/top-products-by-revenue', auth, requireRole('SHOP'), requireOwnerShop(), async (req, res) => {
    try {
        const shopId = req.params.shopId;
        console.log('Fetching top products by revenue for shopId:', shopId);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const topProducts = await Order.aggregate([
            { $match: {
                shopId: new mongoose.Types.ObjectId(shopId),
                createdAt: { $gte: thirtyDaysAgo },
                status: {$in:['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED']}
                }
            },
            { $unwind: "$items" },
            { $group:{
                _id: "$items.productId",
                totalQty: { $sum: "$items.qty" },
                totalRevenue: { $sum: { $multiply: ["$items.qty", "$items.priceSnapshot"] } } // also calculate total revenue for this product
                } 
            },
            { $sort: { totalRevenue: -1 } }, //order by revenue : descending
            { $limit: 5 },
            {
                $lookup: {
                from: "products",
                localField: "_id",
                foreignField: "_id",
                as: "product"
                }
            },
            { $unwind: "$product" },
            { $project: {
                _id: 0,
                productId: "$_id",
                name: "$product.name",
                price: "$product.price",
                images: "$product.images",
                totalQty: 1,
                totalRevenue: 1
                } 
            }
        ]);
        res.json({ topProducts });
        console.log('Top products by quantity:', topProducts);

    } catch (err) {
        console.error("Error fetching top products by quantity:", err);
        res.status(500).json({ message: err.message });
    }
});


// Get top 5 customers by revenue for a shop ✅
router.get('/:shopId/top-customers', auth, requireRole('SHOP'), requireOwnerShop(), async (req, res) => {
    try {
        const shopId = req.params.shopId;
        console.log('Fetching top customers by revenue for shopId:', shopId);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const topCustomers = await Order.aggregate([
            { $match: {
                shopId: new mongoose.Types.ObjectId(shopId),
                createdAt: { $gte: thirtyDaysAgo },
                status: {$in:['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED']}
                }
            },
            { $unwind: "$items" },
            { $group:{
                _id: "$buyerId",
                totalQty: { $sum: "$items.qty" },
                totalRevenue: { $sum: { $multiply: ["$items.qty", "$items.priceSnapshot"] } } // also calculate total revenue for this product
                } 
            },
            { $sort: { totalRevenue: -1 } }, //order by revenue : descending
            { $limit: 5 },
            {
                $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "_id",
                as: "customer"
                }
            },
            { $unwind: "$customer" },
            { $project: {
                _id: 0,
                customerId: "$_id",
                name: "$customer.name",
                email: "$customer.email",
                totalSold: 1,
                totalRevenue: 1
                } 
            }
        ]);
        res.json({ topCustomers });
        console.log('Top customers by revenue:', topCustomers);

    } catch (err) {
        console.error("Error fetching top customers:", err);
        res.status(500).json({ message: err.message });
    }
});


// Get total revenue for a shop with filter by month and year ✅
router.get('/:shopId/total-revenue', auth, requireRole('SHOP'), requireOwnerShop(), async (req, res) => {
    try {
        const shopId = req.params.shopId;
        const month = parseInt(req.query.month);
        const year = parseInt(req.query.year);
        console.log(year, month);

        const match = { shopId: new mongoose.Types.ObjectId(shopId) };
        if (month && year) {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 1);
            match.createdAt = { $gte: startDate, $lt: endDate };
        }
         else if (month && !year) {
            console.log('Filtering revenue by month:', month);  
            const currentYear = new Date().getFullYear();
            const startDate = new Date(currentYear, month - 1, 1);
            const endDate = new Date(currentYear, month, 1);
            match.createdAt = { $gte: startDate, $lt: endDate };

        }
         else if (year) {
            const startDate = new Date(year, 0, 1);
            const endDate = new Date(year + 1, 0, 1);
            match.createdAt = { $gte: startDate, $lt: endDate };
        }
        const revenueData = await Order.aggregate([
            { $match: match },
            { $group: { _id: null, totalRevenue: { $sum: "$revenue" } } }
        ]);
        const totalRevenue = revenueData[0] ? revenueData[0].totalRevenue : 0;
        res.json({ totalRevenue });
    } catch (err) {
        console.error("Error fetching revenue:", err);
        res.status(500).json({ message: err.message });
    }
});


module.exports = router;