const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requirerole');
const requireShopOwner = require('../../middlewares/requireOwner');
const express = require('express');
const router = express.Router();
module.exports = router;
const mongoose = require('mongoose');
const requireOwnerShop = require('../../middlewares/requireOwnerShop');

const Order = require('../../models/orders');
const Shop = require('../../models/shops');
const Category = require('../../models/categories');
const Product = require('../../models/products');
const verifyProduct = require('../../middlewares/verifyProduct');
const Fees = require('../../models/fees');
const { createFeesLogsForOrder } = require('../../services/feesLogs.service');
const Payment = require('../../models/payments');


// Create Order ✅
router.post('/checkout', auth, requireRole('BUYER'), verifyProduct, async (req, res) => {
  try {
    const cart = req.body.items;
    // console.log("Checkout request:", req.body);

    const grouped = {};

    // split cart into groups by shopId
    cart.forEach(item => {
      if (!grouped[item.shopId]) {
        grouped[item.shopId] = [];
      }
      grouped[item.shopId].push(item);
    });

    // console.log("Result: " + JSON.stringify(grouped, null, 2));

    const ordersCreated = [];

    // Find fee with status ACTIVE
    const fee = await Fees.findOne({ status: 'ACTIVE' });
    // console.log("Active fee:", fee);

    // Create one order per shop
    for (const shopId of Object.keys(grouped)) {
      const shopItems = grouped[shopId];
      if (!shopItems || shopItems.length === 0) continue;

      let total = 0;

      // Build order items with correct snapshot per product
      const orderItems = [];

      for (const item of shopItems) {
        const product = await Product.findById(item.productId);
        if (!product) continue; // or throw error

        const qty = Number(item.qty) || 0;
        const price = Number(product.price) || 0;

        total += price * qty;
        console.log(`Adding to order: productId=${item.productId}, qty=${qty}, price=${price}, subtotal=${price * qty}`);

        orderItems.push({
          productId: item.productId,
          qty,
          priceSnapshot: price,                 // snapshot for THIS product
          path: product.images?.[0] || null,     // image for THIS product
          name: product.name || "Unnamed Product"   // name for THIS product
        });
      }

      // revenue calc (kept your logic)
      let revenue = 0;
      if (fee) {
        if (total > fee.threshold) {
          revenue += total * (1 - fee.rate / 100);
          console.log(`Applying percentage fee: total=${total}, rate=${fee.rate}%, revenue=${revenue}`);
        } else {
          revenue += total - fee.fixed;
          console.log(`Applying fixed fee: total=${total}, fixed=${fee.fixed}, revenue=${revenue}`);
        }
      }

      console.log(`Creating order for shopId=${shopId}: total=${total}, revenue=${revenue}`);

      //create orderId as "ORD" + timestamp + random 4 digits with letters
      //Make the date format like 20260101 for better sorting and readability: "ORD-20260101-ABCD"
      const orderId = "ORD-" + new Date().toISOString().slice(0, 10).replace(/-/g, '') + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();

      const order = await Order.create({
        buyerId: req.user.id,
        shopId,
        address: req.body.buyer.address,
        phone: req.body.buyer.phone,
        items: orderItems,
        total,
        revenue,
        orderId,
        paymentMethod: req.body.buyer.paymentMethod
      });

      ordersCreated.push(order);

      // Update stock ONLY for products in this shop order
      for (const item of shopItems) {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stock: -Number(item.qty) } },
          { new: true }
        );
      }
    }

      res.status(201).json({
      message: "Orders created successfully",
      orders: ordersCreated
    });

  } catch (err) {
    console.error("Order creation error:", err);
    res.status(500).json({ message: err.message });
  }
});


// Get Orders by Roles : Buyer or Shop Owner ✅

router.get('/', auth, requireRole('BUYER','SHOP'), async (req, res) => {
  try {
    let orders = [];

    if (req.user.role === 'BUYER') {
      // Get orders for this buyer
      orders = await Order.find({ buyerId: req.user.id })
        .sort({ createdAt: -1 });

      if (orders.length === 0) {
        return res.status(404).json({ message: "No orders found for this buyer" });
      }

    } else if (req.user.role === 'SHOP') {
      // Find the shop(s) of this user
      // console.log('User Shops:', req.user.shops);
      const shops = req.user.shops;

      if (shops.length === 0) {
        return res.status(404).json({ message: "You do not own any shop" });
      }

      // Get all orders and filter by shop
      orders = await Order.find({
        shopId: { $in: shops }
      })
      .populate('buyerId', 'fullName email') // populate buyer details
      .sort({ createdAt: -1 });

      if (orders.length === 0) {
        return res.status(404).json({ message: "No orders found for your shop(s)" });
      }

    }

    res.status(200).json({
      orders
    });

  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({ message: err.message });
  }
});


// Update Order Status ✅

router.patch('/:id', auth, requireRole('SHOP', 'BUYER'), async (req, res) => {
  try {
    const allowedTransitions = {
      PENDING: ["CONFIRMED", "CANCELLED"],
      CONFIRMED: ["PREPARING"],
      PREPARING: ["READY"],
      READY: ["DELIVERED"],
      DELIVERED: [],
      CANCELLED: []
    };

    if (!req.body.status) {
      return res.status(400).json({ message: "Missing status" });
    }

    const { id } = req.params;
    const { status } = req.body;
    const next = status.toUpperCase();

    // Get the order
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const current = order.status.toUpperCase();

    //BUYER RULE
    if (req.user.role === 'BUYER') {
      console.log(`Buyer ${req.user.id} attempting to change order ${id} from ${current} to ${next}`);
      // Check ownership
      if (order.buyerId.toString() !== req.user.id) {
        return res.status(403).json({ message: "You do not have permission to update this order" });
      }

      // Buyer can only cancel PENDING orders
      if (next !== "CANCELLED") {
        return res.status(403).json({ message: "Buyers can only cancel their orders" });
      }

      if (current !== "PENDING") {
        return res.status(400).json({ message: `Order cannot be cancelled once it is ${current}` });
      }

      // Restore stock
      for (const item of order.items) {
        const product = await Product.findById(item.productId);
        if (product) {
          product.stock += item.qty;
          if (product.stock > 0) product.status = 'ACTIVE';
          await product.save();
        }
      }

      // Update status
      order.status = "CANCELLED";
      await order.save();

      return res.json({ message: "Order cancelled successfully", order });
    }

    //SHOP RULE
    if (req.user.role === 'SHOP') {
      // Check shop ownership

      const isOwner = req.user.shops.some(
    shop => shop._id.toString() === order.shopId.toString()
    );

    if (!isOwner) {
    return res.status(403).json({ error: 'You do not have permission to update this order' });
    }

     

      // Validate allowed transitions
      const allowedNext = allowedTransitions[current];
      if (!allowedNext.includes(next)) {
        return res.status(400).json({
          message: `Invalid status change: '${current}' → '${next}' is not allowed`,
          allowedTransitions: allowedNext
        });
      }

      const previousStatus = order.status.toLocaleUpperCase();

      // Update status
      order.status = next;
      await order.save();

      // Create fees log only when transitioning to DELIVERED
      if (previousStatus !== 'DELIVERED' && next === 'DELIVERED') {
        try {
          await createFeesLogsForOrder(order);
        } catch (e) {
          console.error('Failed to create fees log:', e.message);
          // Decide: do you want to fail the request or not?
          // If strict: return res.status(500).json({ message: 'Fees log creation failed' });
        }
      }

      return res.json({ message: "Order status updated", order });
    }

  } catch (err) {
    console.error("Error updating order status:", err);
    res.status(500).json({ message: err.message });
  }
});


// Get orders with specific status for a shop ✅

router.get('/shop/:shopId', auth, requireRole('SHOP'), requireOwnerShop(), async (req, res) => {
    try {
        const shopId = req.params.shopId;
        console.log('Fetching orders for shopId:', shopId);
        const statusFilter = req.query.status ? req.query.status.toUpperCase() : null;

        if (!statusFilter) {
            return res.status(400).json({ error: 'Status query parameter is required' });
        }

        console.log('Status filter:', statusFilter);

        const orders = await Order.countDocuments({
            shopId: new mongoose.Types.ObjectId(shopId),
            status: statusFilter
        });

        res.json({
            orders
        });
    } catch (err) {
        console.error("Error fetching orders:", err);
        res.status(500).json({ message: err.message });
    }
});


// Get the latest orders for a shop ✅
router.get('/shop/:shopId/latest', auth, requireRole('SHOP'), requireOwnerShop(), async (req, res) => {
  try {
    const shopId = req.params.shopId;
    const orders = await Order.find({ shopId: new mongoose.Types.ObjectId(shopId) })
      .populate('buyerId', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(3);

    res.json({
      orders
    });
  } catch (err) {
    console.error("Error fetching latest orders:", err);
    res.status(500).json({ message: err.message });
  }
});


// get top month revenue ever for a shop ✅
router.get('/shop/:shopId/revenue/top-month', auth, requireRole('SHOP'), requireOwnerShop(), async (req, res) => {
  try {
    const shopId = req.params.shopId;
    const topMonthRevenue = await Order.aggregate([
      { $match: { shopId: new mongoose.Types.ObjectId(shopId), status: { $in: ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'] }} },
      { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, totalRevenue: { $sum: "$revenue" } } },
      { $sort: { totalRevenue: -1 } },
      { $limit: 1 }
    ]);
    res.json({
      topMonthRevenue
    });
  } catch (err) {
    console.error("Error fetching top month revenue:", err);
    res.status(500).json({ message: err.message });
  }
});


// get top year revenue ever for a shop ✅
router.get('/shop/:shopId/revenue/top-year', auth, requireRole('SHOP'), requireOwnerShop(), async (req, res) => {
  try {
    const shopId = req.params.shopId;
    const topYearRevenue = await Order.aggregate([
      { $match: { shopId: new mongoose.Types.ObjectId(shopId), status: { $in: ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'] } } },
      { $group: { _id: { year: { $year: "$createdAt" } }, totalRevenue: { $sum: "$revenue" } } },
      { $sort: { totalRevenue: -1 } },
      { $limit: 1 }
    ]);
    res.json({
      topYearRevenue
    });
  } catch (err) {
    console.error("Error fetching top year revenue:", err);
    res.status(500).json({ message: err.message });
  }
});


// get all payment methods in general ✅
router.get('/payments', auth, requireRole('SHOP'), async (req, res) => {
  try {
    console.log('Fetching payment methods');
    const payments = await Payment.find();

    res.json({
      payments
    });
  } catch (err) {
    console.error("Error fetching payments:", err);
    res.status(500).json({ message: err.message });
  }
});


module.exports = router;
