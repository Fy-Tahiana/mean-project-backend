const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requirerole');
const requireShopOwner = require('../../middlewares/requireOwner');
const express = require('express');
const router = express.Router();
module.exports = router;
const mongoose = require('mongoose');

const Order = require('../../models/orders');
const Shop = require('../../models/shops');
const Category = require('../../models/categories');
const Product = require('../../models/products');
const verifyProduct = require('../../middlewares/verifyProduct');

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

    // Create one order per shop
    for (const shopId of Object.keys(grouped)) {
      const shopItems = grouped[shopId];

      if (!shopItems || shopItems.length === 0) continue;

      let Path = [];
      let Snapshot = 0;

      // Calculate total for this shop
      let total = 0;
      let product = null;

      for (let i = 0; i < shopItems.length; i++) {
        const item = shopItems[i];
        product = await Product.findById(item.productId);

        const qty = Number(item.qty) || 0;
        const price = Number(product.price) || 0;

        // console.log("Running total:", qty, "x", price, "=", qty * price);

        Snapshot = product.price;
        Path = product.images?.[0] || null;

        total += price * qty;
      }

      // total = Math.round(total * 100) / 100;
      console.log("Final total:", total);

      // Create order
      const order = await Order.create({
        buyerId: req.user.id,
        shopId,
        address: req.body.buyer.address,
        phone: req.body.buyer.phone,
        items: shopItems.map(i => ({
          productId: i.productId,
          qty: i.qty,
          priceSnapshot: Snapshot,
          path : Path
        })),
        total
      });

      ordersCreated.push(order);
      await order.save();

      // Update stock for each product in the order
      product.stock = Math.max(0, product.stock - shopItems[0].qty);
      if(product.stock === 0) {
        product.status = 'OUT_OF_STOCK';
      }
      await product.save();

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


module.exports = router;
