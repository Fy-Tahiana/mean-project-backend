const express = require('express');
const router = express.Router();

// Define v1 routes here 
router.use('/v1/auth', require('./auth.routes'));
router.use('/v1/health', require('./health.routes'));
router.use('/v1/shops', require('./shop.routes'));
router.use('/v1/products', require('./product.routes'));
router.use('/v1/categories', require('./categorie.routes'));
router.use('/v1/orders', require('./order.routes'));
router.use('/v1/users', require('./user.routes'));


module.exports = router;
