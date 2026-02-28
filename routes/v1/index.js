const express = require('express');
const router = express.Router();

// Define v1 routes here 
router.use('/v1/auth', require('./auth.routes'));
router.use('/v1/health', require('./health.routes'));
router.use('/v1/shop', require('./shop.routes'));

module.exports = router;
