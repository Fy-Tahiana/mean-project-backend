const express = require('express');
const router = express.Router();
const auth = require('../../middlewares/auth');
const User = require('../../models/users');
const requireRole = require('../../middlewares/requirerole');

module.exports = router;

// Get all products with optional filters
// GET /api/v1/products?status=active&categoryId=12345&shopId=67890&q=shoes&min=10&max=100&sort=price_desc&page=2
router.get('/', auth, requireRole('ADMIN'),  async(req, res) => {

    try {
        const filters = {};
        let sortObj = {};
        
        // role filter
        if (req.query.role)
        {
            const roles = req.query.role.split(',').map(r => r.toUpperCase().trim());
            filters.role = { $in: roles };
        }

        // status filter
        if (req.query.status)
        {
            filters.status = req.query.status.toLowerCase();
        }

        // search by name or email (regex)
        if (req.query.q) {
            const q = req.query.q.trim();
            const words = q.split(/\s+/);
            const regex = words.map(word => `(?=.*${word})`).join('') + '.*';

            filters.$or = [
                { fullName: { $regex: regex, $options: 'i' } },
                { email: { $regex: regex, $options: 'i' } }
            ];
        }

        // sorting
        if (req.query.sort)
        {
            const s = req.query.sort.toLocaleLowerCase();
            if (s === 'name_asc') sortObj.fullName = 1;
            if (s === 'name_desc') sortObj.fullName = -1;
            if (s === 'created_asc') sortObj.createdAt = 1;
            if (s === 'created_desc') sortObj.createdAt = -1;
        }

        // pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // fetch users
        const users = await User.find(filters).sort(sortObj).skip(skip).limit(limit).lean();
        const totalUsers = await User.countDocuments(filters);
        const totalPages = Math.ceil(totalUsers / limit);

        res.status(200).json({ users, totalPages });

    } catch (err) {
        console.error("Error fetching users:", err);
        res.status(500).json({ error: 'Failed to fetch users', details: err.message});
    }
    
});

// UPDATE user status
router.patch('/:id/status', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const { status } = req.body;

        // Validate status
        if (!['active', 'banned'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }

        // Find user
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent updating admin status
        if (user.role.toUpperCase() === 'ADMIN') {
            return res.status(403).json({ error: 'Cannot update status of an ADMIN user' });
        }

        // Update status
        user.status = status;
        await user.save();

        res.status(200).json({ message: 'User status updated successfully', user });
    } catch (err) {
        console.error("Error updating user status:", err);
        res.status(500).json({ error: 'Failed to update user status', details: err.message });
    }
});

module.exports = router;
