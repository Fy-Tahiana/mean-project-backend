const express = require('express');
const router = express.Router();

// This is the default route
router.use('/api', require('./v1'));

module.exports = router;
