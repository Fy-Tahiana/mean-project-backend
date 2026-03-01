const express = require('express');
const router = express.Router();
const User = require('../../models/user.model');

router.get('/users', (req, res) => {

    res.json({ message: 'Get all users route' });
    
});



module.exports = router;