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
          path: product.images?.[0] || null     // image for THIS product
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

      const order = await Order.create({
        buyerId: req.user.id,
        shopId,
        address: req.body.buyer.address,
        phone: req.body.buyer.phone,
        items: orderItems,
        total,
        revenue
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
        .populate('items.productId')
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
      .sort({ createdAt: -1 });

      if (orders.length === 0) {
        return res.status(404).json({ message: "No orders found for your shop(s)" });
      }

    }

    res.status(200).json({
      count: orders.length,
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
      const shopIds = req.user.shops.map(id => id.toString());
      if (!shopIds.includes(order.shopId.toString())) {
        return res.status(403).json({ message: "You do not have permission to update this order" });
      }

      // Validate allowed transitions
      const allowedNext = allowedTransitions[current];
      if (!allowedNext.includes(next)) {
        return res.status(400).json({
          message: `Invalid status change: '${current}' → '${next}' is not allowed`,
          allowedTransitions: allowedNext
        });
      }

      // Update status
      order.status = next;
      await order.save();

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


module.exports = router;
