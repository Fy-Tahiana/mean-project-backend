const express = require('express');
const router = express.Router();

router.get('/check', (req, res) => {
    res.json({ message: 'Health check route' });
});


module.exports = router;