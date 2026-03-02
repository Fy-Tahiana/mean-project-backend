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
            logoUrl: logo ? logo.filename : "default.png",
            coverUrl: cover ? cover.filename : null,
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

// GET ALL Shops with optional filters (category, status) and search
// Usage example : 
// GET /api/v1/shops/all?status=ACTIVE&categoryId=12345&q=coffee&page=1&limit=10
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/all', auth, requireRole('ADMIN'), async (req, res) => {
  try {
    const filters = {};
    const sortObj = {};

    // status filter (optional: validate allowed statuses)
    if (typeof req.query.status === 'string' && req.query.status.trim()) {
      filters.status = req.query.status.trim().toUpperCase();
    }

    // category filter
    if (typeof req.query.categoryId === 'string' && req.query.categoryId.trim()) {
      const categoryId = req.query.categoryId.trim();
      if (!mongoose.isValidObjectId(categoryId)) {
        return res.status(400).json({ error: 'Invalid categoryId' });
      }
      filters.categoryId = categoryId;
    }

    // search
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const q = req.query.q.trim().slice(0, 100); // basic guard
      const words = q.split(/\s+/).map(escapeRegex);

      // "all words in any order" via lookaheads (escaped)
      const regex = words.map(w => `(?=.*${w})`).join('') + '.*';

      filters.$or = [
        { name: { $regex: regex, $options: 'i' } },
        { description: { $regex: regex, $options: 'i' } }
      ];
    }

    // sorting
    const s = (req.query.sort || '').toString().toLowerCase();
    if (s === 'name_asc') sortObj.name = 1;
    else if (s === 'name_desc') sortObj.name = -1;
    else if (s === 'created_asc') sortObj.createdAt = 1;
    else sortObj.createdAt = -1; // default newest

    // stable tie-breaker
    sortObj._id = -1;

    // pagination (bounded)
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const [shops, totalShops] = await Promise.all([
      Shop.find(filters)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .populate('ownerUserId', 'fullName')
        .populate('categoryId', 'name')
        .lean(),
      Shop.countDocuments(filters),
    ]);

    const totalPages = Math.ceil(totalShops / limit);

    res.status(200).json({
      shops,
      pagination: { page, limit, totalShops, totalPages }
    });
  } catch (err) {
    console.error("Error fetching shops:", err);
    res.status(500).json({ error: 'Failed to fetch shops', details: err.message });
  }

});
// Get total number of shops
router.get('/KPIs', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const [ totalShops, totalActiveShops, totalPendingShops, totalRejectedShops, totalSuspendedShops ] = await Promise.all([
            Shop.countDocuments(),
            Shop.countDocuments({ status: 'ACTIVE'}),
            Shop.countDocuments( { status: 'PENDING' }),
            Shop.countDocuments({ status: 'REJECTED' }),
            Shop.countDocuments({ status: 'SUSPENDED' })
        ]);

        return res.status(200).json({
            totalShops,
            totalActiveShops,
            totalPendingShops,
            totalRejectedShops,
            totalSuspendedShops
        });
    }
    catch (err)
    {
        res.status(500).json({ error: 'Failed to fetch total number of shops', details: err.message});
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

// UPDATE Shop status
router.patch('/:id/status', auth, requireRole('ADMIN'), async (req,res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) 
        {
            return res.status(400).json({ error: 'Invalid shop id' });
        }

        const status = req.body?.status?.toUpperCase();

        if (!['ACTIVE', 'REJECTED', 'SUSPENDED'].includes(status))
        {
            return res.status(400).json({ error: 'Invalid status value' });
        }

        // Find shop
        const shop = await Shop.findById(req.params.id);
        if(!shop)
        {
            return res.status(404).json({ error: 'User not found'});
        }

        // Update status
        shop.status = status;
        await shop.save();

        return res.status(200).json({ message: 'Shop status updated', shop });

    } catch (err) {
        console.error("Error updating shop status", err);
        res.status(500).json({ error: 'Failed to update shop status', details: err.message });
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
router.get('/:shopId/customers', auth, requireRole('SHOP'), requireOwnerShop(), async (req, res) => {
    try {
        const { shopId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(shopId)) {
            return res.status(400).json({ message: 'Invalid shopId' });
        }

        const customers = await Order.aggregate([
            {
                $match: {
                    shopId: new mongoose.Types.ObjectId(shopId),
                    status: { $ne: 'CANCELLED' }
                }
            },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: '$buyerId',
                    lastOrderDate: { $first: '$createdAt' },
                    address: { $first: '$address' },
                    phoneFromOrder: { $first: '$phone' },
                    totalOrders: { $sum: 1 },
                    totalSpent: { $sum: '$total' }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'customer'
                }
            },
            { $unwind: '$customer' },
            {
                $project: {
                    _id: 0,
                    id: { $toString: '$_id' },
                    fullName: '$customer.fullName',
                    email: '$customer.email',
                    phone: {
                        $ifNull: ['$customer.phone', '$phoneFromOrder']
                    },
                    address: { $ifNull: ['$address', ''] },
                    lastOrderDate: 1,
                    totalOrders: 1,
                    totalSpent: 1
                }
            },
            { $sort: { lastOrderDate: -1 } }
        ]);

        res.status(200).json({ customers });
    } catch (err) {
        console.error('Error fetching shop customers:', err);
        res.status(500).json({ message: err.message });
    }
});

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
                name: "$customer.fullName",
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

// Get total revenue for a shop as a monthly review ✅
router.get('/:shopId/monthly-revenue', auth, requireRole('SHOP'), requireOwnerShop(), async (req, res) => {
    try {
        const shopId = req.params.shopId;

        // Get year from query OR default to current year
        const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();

        const startDate = new Date(year, 0, 1);   // Jan 1, YEAR
        const endDate = new Date(year + 1, 0, 1); // Jan 1, NEXT YEAR

        const match = {
            shopId: new mongoose.Types.ObjectId(shopId),
            createdAt: { $gte: startDate, $lt: endDate }
        };

        const revenueData = await Order.aggregate([
            { 
                $match: { 
                    ...match, 
                    status: { $in: ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'] } 
                } 
            },
            {
                $group: {
                    _id: { month: { $month: "$createdAt" } },
                    totalRevenue: { $sum: "$revenue" }
                }
            },
            { $sort: { "_id.month": 1 } }
        ]);

        // Build an array 12 months long so chart always has full x-axis
        const monthlyRevenue = Array.from({ length: 12 }, (_, i) => {
            const found = revenueData.find(r => r._id.month === i + 1);
            return {
                month: i + 1,
                totalRevenue: found ? found.totalRevenue : 0
            };
        });

        res.json({
            monthlyRevenue
        });

    } catch (err) {
        console.error("Error fetching monthly revenue:", err);
        res.status(500).json({ message: err.message });
    }
});


module.exports = router;
