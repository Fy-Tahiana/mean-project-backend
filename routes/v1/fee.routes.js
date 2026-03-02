const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requirerole');
const express = require('express');
const Fees = require('../../models/fees');
const { getTopMonth, getTopYear, getTopShops, getCommissionsGraphAnnual, getCommissionsGraphMonthly } = require('../../services/feesLogs.service');
const router = express.Router();
const mongoose = require('mongoose');

module.exports = router;

// CREATE Fee
// There should be only ONE ACTIVE fee at any time.
// - If the new fee is ACTIVE (or status not provided => default ACTIVE), set all other ACTIVE fees to INACTIVE.

router.post('/', auth, requireRole('ADMIN'), async (req, res) => {
  try {
    let { name, rate, threshold, fixed, status } = req.body;

    if (!name || rate == null || threshold == null || fixed == null) {
      return res.status(400).json({
        message: "Missing arguments. Required: name, rate, threshold, fixed"
      });
    }

    status = status ? String(status).toUpperCase() : 'ACTIVE';
    if (!['ACTIVE', 'INACTIVE'].includes(status)) {
      return res.status(400).json({
        message: "Invalid status. Allowed: ACTIVE, INACTIVE"
      });
    }

    rate = Number(rate);
    threshold = Number(threshold);
    fixed = Number(fixed);

    if ([rate, threshold, fixed].some(Number.isNaN)) {
      return res.status(400).json({
        message: "rate, threshold, fixed must be valid numbers"
      });
    }

    if (fixed > threshold) {
      return res.status(400).json({
        message: "Fixed must be inferior or equal to Threshold"
      });
    }

    const requestedActive = (status === 'ACTIVE');

    // Create FIRST
    // If user wants ACTIVE, create as INACTIVE first to avoid unique-ACTIVE conflict at insert time.
    const fee = await Fees.create({
      name,
      rate,
      threshold,
      fixed,
      status: requestedActive ? 'INACTIVE' : 'INACTIVE' // keep INACTIVE on create
    });

    // If user requested INACTIVE, we are done.
    if (!requestedActive) {
      return res.status(201).json({ message: "Fee created successfully", fee });
    }

    // Switch ACTIVE: deactivate previous active, then activate the new one
    // Save previous active id for rollback if activation fails
    const previousActive = await Fees.findOne({ status: 'ACTIVE' }).select('_id');

    // Deactivate any current active (should be 0 or 1 if your index is correct)
    await Fees.updateMany({ status: 'ACTIVE' }, { $set: { status: 'INACTIVE' } });

    try {
      // Activate the newly created fee
      const activated = await Fees.findByIdAndUpdate(
        fee._id,
        { $set: { status: 'ACTIVE' } },
        { new: true, runValidators: true }
      );

      // Extra safety: ensure no other ACTIVE remains (if DB had bad data)
      await Fees.updateMany(
        { status: 'ACTIVE', _id: { $ne: activated._id } },
        { $set: { status: 'INACTIVE' } }
      );

      return res.status(201).json({ message: "Fee created successfully", fee: activated });

    } catch (err) {
      // Rollback attempt: reactivate previous active if there is no ACTIVE now
      const activeExists = await Fees.exists({ status: 'ACTIVE' });

      if (!activeExists && previousActive?._id) {
        try {
          await Fees.updateOne(
            { _id: previousActive._id },
            { $set: { status: 'ACTIVE' } }
          );
        } catch (_) {
          // ignore rollback failure
        }
      }

      // since request asked for ACTIVE but failed, remove created fee
      await Fees.deleteOne({ _id: fee._id }).catch(() => {});

      if (err.code === 11000) {
        return res.status(409).json({
          message: "Only one ACTIVE fee is allowed. Another ACTIVE fee already exists."
        });
      }

      throw err;
    }

  } catch (err) {
    console.error("Fee creation error", err);
    return res.status(500).json({ message: "Fee creation error", details: err.message });
  }
});

// UPDATE Fee
router.patch('/:id', auth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid fee id' });
    }

    const fee = await Fees.findById(id);
    if (!fee) {
      return res.status(404).json({ message: 'Fee not found' });
    }

    const body = req.body || {};
    let requestedStatus = null;

    // --- Apply updates (only if provided) ---
    if (typeof body.name === 'string') fee.name = body.name;

    if (body.rate != null) {
      const r = Number(body.rate);
      if (Number.isNaN(r)) return res.status(400).json({ message: 'rate must be a number' });
      fee.rate = r;
    }

    if (body.threshold != null) {
      const t = Number(body.threshold);
      if (Number.isNaN(t)) return res.status(400).json({ message: 'threshold must be a number' });
      fee.threshold = t;
    }

    if (body.fixed != null) {
      const f = Number(body.fixed);
      if (Number.isNaN(f)) return res.status(400).json({ message: 'fixed must be a number' });
      fee.fixed = f;
    }

    // Validate fixed <= threshold using the *final* values (updated or old)
    if (fee.fixed > fee.threshold) {
      return res.status(400).json({ message: 'Fixed must be inferior or equal to Threshold' });
    }

    if (body.status != null) {
      requestedStatus = String(body.status).toUpperCase();
      if (!['ACTIVE', 'INACTIVE'].includes(requestedStatus)) {
        return res.status(400).json({ message: 'Invalid status. Allowed: ACTIVE, INACTIVE' });
      }
    }

    // If no status change requested, just save updates
    if (!requestedStatus || requestedStatus === fee.status) {
      const saved = await fee.save();
      return res.status(200).json({ message: 'Fee updated successfully', fee: saved });
    }

    // If switching to INACTIVE: just save
    if (requestedStatus === 'INACTIVE') {
      fee.status = 'INACTIVE';

      const saved = await fee.save();
      return res.status(200).json({ message: 'Fee updated successfully', fee: saved });
    }

    // If switching to ACTIVE: enforce single ACTIVE
    // Save previous active fee id for rollback
    const previousActive = await Fees.findOne({ status: 'ACTIVE' }).select('_id');

    // Deactivate previous active (if it's not the same fee)
    if (previousActive && !previousActive._id.equals(fee._id)) {
      await Fees.updateOne(
        { _id: previousActive._id },
        { $set: { status: 'INACTIVE' } }
      );
    }

    try {
      fee.status = 'ACTIVE';
      const saved = await fee.save();

      // Extra safety: if DB had bad data, force all other ACTIVE to INACTIVE
      await Fees.updateMany(
        { status: 'ACTIVE', _id: { $ne: saved._id } },
        { $set: { status: 'INACTIVE' } }
      );

      return res.status(200).json({ message: 'Fee updated successfully', fee: saved });
    } catch (err) {
      // Rollback best-effort: restore previous active if we deactivated one
      if (previousActive && !previousActive._id.equals(fee._id)) {
        await Fees.updateOne(
          { _id: previousActive._id },
          { $set: { status: 'ACTIVE' } }
        ).catch(() => {});
      }

      if (err.code === 11000) {
        return res.status(409).json({
          message: 'Only one ACTIVE fee is allowed. Another ACTIVE fee already exists.'
        });
      }

      throw err;
    }

  } catch (err) {
    console.error('Fee update error', err);
    return res.status(500).json({ message: 'Fee update error', details: err.message });
  }
});

/// DELETE fee
// Only INACTIVE fees can be deleted.
// If fee is ACTIVE => refuse and tell user to define another ACTIVE fee first (create/update).
router.delete('/:id', auth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid fee id' });
    }

    const fee = await Fees.findById(id);
    if (!fee) {
      return res.status(404).json({ message: 'Fee not found' });
    }

    if (fee.status === 'ACTIVE') {
      return res.status(409).json({
        message:
          "You can't delete the ACTIVE fee. Define another ACTIVE fee first (create a new one as ACTIVE or update one fee to ACTIVE), then delete this one."
      });
    }

    await Fees.deleteOne({ _id: fee._id });

    return res.status(200).json({
      message: 'Fee deleted',
      deletedId: fee._id
    });
  } catch (err) {
    console.error('Fee delete error', err);
    return res.status(500).json({ message: 'Fee delete error', details: err.message });
  }
});

// LIST fees (ACTIVE first)
router.get('/', auth, requireRole('ADMIN'), async (req, res) => {
  try {
    // optional pagination
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    // Sort ACTIVE first, then newest updated
    const [fees, total] = await Promise.all([
      Fees.aggregate([
        {
          $addFields: {
            statusOrder: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 0, 1] }
          }
        },
        { $sort: { statusOrder: 1, updatedAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: { statusOrder: 0 } }
      ]),
      Fees.countDocuments()
    ]);

    return res.status(200).json({
      fees,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error listing fees: ', err);
    return res.status(500).json({ message: 'Failed to list fees', details: err.message });
  }
});

// DASHBOARD Top year - Top Month - Top shops
router.get('/dashboard', auth, requireRole('ADMIN'), async (req, res) => {
  try {
    const topYear = await getTopYear();

    const yearForTopMonth = topYear?.year ?? new Date().getUTCFullYear();

    // tu peux aussi laisser le front envoyer ?limit=4
    const limit = req.query.limit ?? 4;

    const [topMonth, topShops] = await Promise.all([
      getTopMonth(yearForTopMonth),
      getTopShops(yearForTopMonth, limit)
    ]);

    return res.status(200).json({
      topYear,
      topMonth,
      topShops
    });
  } catch (err) {
    console.error('Error fetching dashboard Fees: ', err);
    return res.status(500).json({
      message: 'Failed to fetch Dashboard Fees',
      details: err.message
    });
  }
});

router.get('/dashboard/fees-graph', auth, requireRole('ADMIN'), async (req, res) => {
  try {
    const filter = String(req.query.filter || 'ANNUAL').toUpperCase();
    const year = req.query.year || new Date().getUTCFullYear();

    if (filter === 'ANNUAL') {
      const graph = await getCommissionsGraphAnnual(year);
      return res.status(200).json(graph);
    }

    if (filter === 'MONTHLY') {
      const month = req.query.month; // required
      if (!month) return res.status(400).json({ message: 'month is required for MONTHLY filter (1..12)' });

      const graph = await getCommissionsGraphMonthly(year, month);
      return res.status(200).json(graph);
    }

    return res.status(400).json({ message: "Invalid filter. Use ANNUAL or MONTHLY" });
  } catch (err) {
    console.error('Error fetching commissions graph:', err);
    return res.status(500).json({ message: 'Failed to fetch commissions graph', details: err.message });
  }
});