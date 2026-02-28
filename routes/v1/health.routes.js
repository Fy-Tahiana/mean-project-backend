const express = require('express');
const router = express.Router();
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requirerole');

router.get('/check', auth, requireRole('ADMIN'), (req, res) => {
    res.json({ message: 'Health check route' });
});


module.exports = router;