
const express = require('express');
const router = express.Router();
const Category = require('../../models/categories');

router.get('/', async (req, res) => {
    try {
        //return only categories with type not all categories
        if(req.query.type)
        {
            const categories = await Category.find({ type: req.query.type.toUpperCase() });
            res.status(200).json({ categories });
        }

    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch categories', details: error.message });
    }

});



module.exports = router;
