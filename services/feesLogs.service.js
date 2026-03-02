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

// Get the month with the highest total of fees for a given year

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

async function getTopMonth(year) {
  const y = parseInt(year, 10);
  if (!Number.isInteger(y) || y < 1970 || y > 3000) {
    throw new Error('Invalid year');
  }

  const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0));

  const result = await FeesLog.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: { month: { $month: '$createdAt' } },
        totalCommissions: { $sum: '$feeAmount' },
        ordersCount: { $sum: 1 }
      }
    },
    { $sort: { totalCommissions: -1 } },
    { $limit: 1 }
  ]);

  if (result.length === 0) return null;

  const monthNumber = result[0]._id.month; // 1..12

  return {
    year: y,
    month: monthNumber,
    monthName: MONTHS_FR[monthNumber - 1],
    totalCommissions: result[0].totalCommissions,
    ordersCount: result[0].ordersCount
  };
}

// Get the year with the highest total fees
async function getTopYear() {
  const result = await FeesLog.aggregate([
    {
      $group: {
        _id: { year: { $year: '$createdAt' } },
        totalCommissions: { $sum: '$feeAmount' },
        ordersCount: { $sum: 1 }
      }
    },
    { $sort: { totalCommissions: -1 } },
    { $limit: 1 }
  ]);

  if (result.length === 0) return null;

  return {
    year: result[0]._id.year,
    totalCommissions: result[0].totalCommissions,
    ordersCount: result[0].ordersCount
  };
}


// Get top shops
async function getTopShops(year, limit) {
  const y = parseInt(year, 10);
  const l = Math.min(Math.max(parseInt(limit, 10) || 4, 1), 100);

  const start = new Date(Date.UTC(y, 0, 1));
  const end = new Date(Date.UTC(y + 1, 0, 1));

  const rows = await FeesLog.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: '$shopId',
        totalCommissions: { $sum: '$feeAmount' },
        ordersCount: { $sum: 1 }
      }
    },
    { $sort: { totalCommissions: -1 } },
    { $limit: l },
    {
      $lookup: {
        from: 'shops',
        localField: '_id',
        foreignField: '_id',
        as: 'shop'
      }
    },
    { $unwind: { path: '$shop', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        shopId: { $toString: '$_id' },
        shopName: '$shop.name',
        totalCommissions: 1,
        ordersCount: 1
      }
    }
  ]);

  return rows;
}

function daysInMonthUTC(year, month1to12) {
  // month1to12: 1..12
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/**
 * Graph annuel: 12 mois (1..12)
 */
async function getCommissionsGraphAnnual(year) {
  const y = parseInt(year, 10);
  if (!Number.isInteger(y) || y < 1970 || y > 3000) throw new Error('Invalid year');

  const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0));

  const rows = await FeesLog.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: { month: { $month: '$createdAt' } },
        totalCommissions: { $sum: '$feeAmount' },
        ordersCount: { $sum: 1 }
      }
    },
    { $sort: { '_id.month': 1 } }
  ]);

  // fill missing months with 0
  const map = new Map(rows.map(r => [r._id.month, r]));
  const points = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const r = map.get(month);
    return {
      month, // 1..12
      totalCommissions: r ? r.totalCommissions : 0,
      ordersCount: r ? r.ordersCount : 0
    };
  });

  return { filter: 'ANNUAL', year: y, points };
}

/**
 * Graph mensuel: jours du mois (1..28/29/30/31)
 */
async function getCommissionsGraphMonthly(year, month) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10); // 1..12
  if (!Number.isInteger(y) || y < 1970 || y > 3000) throw new Error('Invalid year');
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error('Invalid month (1..12)');

  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));

  const rows = await FeesLog.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: { day: { $dayOfMonth: '$createdAt' } },
        totalCommissions: { $sum: '$feeAmount' },
        ordersCount: { $sum: 1 }
      }
    },
    { $sort: { '_id.day': 1 } }
  ]);

  const nbDays = daysInMonthUTC(y, m);
  const map = new Map(rows.map(r => [r._id.day, r]));
  const points = Array.from({ length: nbDays }, (_, i) => {
    const day = i + 1;
    const r = map.get(day);
    return {
      day, // 1..nbDays
      totalCommissions: r ? r.totalCommissions : 0,
      ordersCount: r ? r.ordersCount : 0
    };
  });

  return { filter: 'MONTHLY', year: y, month: m, points };
}

module.exports = { createFeesLogsForOrder, getTopMonth, getTopYear, getTopShops, getCommissionsGraphAnnual, getCommissionsGraphMonthly };