const FeesLog = require('../models/feesLogs');

// CREATE FeesLog when Order.status = DELIVERED
async function createFeesLogsForOrder(order) {
  if (!order) throw new Error('Order is required');

  const status = String(order.status || '').toUpperCase();
  if (status !== 'DELIVERED') return null;

  const orderTotal = Number(order.total);
  const revenue = Number(order.revenue);

  if (Number.isNaN(orderTotal) || Number.isNaN(revenue)) {
    throw new Error('Order total/revenue must be numbers');
  }

  const feeAmount = Math.max(0, orderTotal - revenue);

  // Upsert (idempotent): avoid duplicates even if called twice
  const feeslog = await FeesLog.findOneAndUpdate(
    { orderId: order._id },
    {
      $setOnInsert: {
        shopId: order.shopId,
        orderId: order._id,
        feeAmount
      }
    },
    { upsert: true, new: true }
  );

  return feeslog;
}

module.exports = { createFeesLogsForOrder };