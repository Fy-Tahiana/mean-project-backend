
const express = require('express');
const router = express.Router();
const Category = require('../../models/categories');
const Shop = require('../../models/shops');
const Product = require('../../models/products');
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requirerole');

module.exports = router;
const mongoose = require('mongoose');

//GET all Categories
router.get('/', auth, requireRole('ADMIN'), async (req,res) => {
    try {
        const categories = await Category.find();
        res.json(categories);
    } catch (err) {
        res.status(500).json({ message: err.message});
    }
});

// CREATE Category
router.post('/', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const { name, type } = req.body;

        console.log("Creating category with data: ", req.body);

        //Check if a category with the same name and type already exists
        const existingCategory = await Category.findOne({
            name: name,
            type: type.toUpperCase()
        });

        if (existingCategory)
        {
            return res.status(400).json({
                message: "Category with this name and type already exists"
            });
        }
        

        //Create the category
        const category = new Category({ 
            name, 
            type : type.toUpperCase(), 
        });
        await category.save();

        // Return the created category
        res.status(201).json({
            message: "Category created successfully",
            category
        });
    } catch (err) {
        console.error("Error creating category:", err);
        res.status(500).json({ error: 'Failed to create category', details: err.message });
    }
});

// GET Categories by Type
router.get('/getByType', async (req, res) => {
    try {
        //return only categories with type not all categories
        if(req.query.type)
        {
            const categories = await Category.find({ type: req.query.type.toUpperCase() });
            res.status(200).json({ categories });
        }

    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch categories', details: err.message });
    }

});

// DELETE category
// - If category is used -> soft delete (isActive=false) + move references to OTHERS of same type
// - If category is not used -> hard delete
router.delete('/:id', auth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    // 1) Validate id
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid category id' });
    }

    // 2) Find category
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Optional safety: don't allow deleting OTHERS
    if ((category.name || '').toUpperCase() === 'OTHERS') {
      return res.status(400).json({ message: 'Cannot delete OTHERS category' });
    }

    // 3) Check usage ONLY in the correct collection based on category.type
    let isUsed = false;

    if (category.type === 'SHOP') {
      isUsed = !!(await Shop.exists({ categoryId: id }));
    } else if (category.type === 'PRODUCT') {
      isUsed = !!(await Product.exists({ categoryId: id }));
    } else {
      // should never happen because of enum, but just in case
      return res.status(400).json({ message: 'Invalid category type' });
    }

    // 4) If not used -> hard delete
    if (!isUsed) {
      await Category.deleteOne({ _id: id });
      return res.status(200).json({ message: 'Category deleted' });
    }

    // 5) Used -> soft delete category
    category.isActive = false;
    await category.save();

    // 6) Ensure matching OTHERS category exists for THIS type (SHOP or PRODUCT)
    // Also re-activates it if it already exists but was inactive.
    const others = await Category.findOneAndUpdate(
      { name: 'OTHERS', type: category.type },
      {
        $set: { isActive: true },
        $setOnInsert: { name: 'OTHERS', type: category.type }
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    // 7) Move references to OTHERS for the correct collection
    let updateResult;
    if (category.type === 'SHOP') {
      updateResult = await Shop.updateMany(
        { categoryId: id },
        { $set: { categoryId: others._id } }
      );
    } else {
      updateResult = await Product.updateMany(
        { categoryId: id },
        { $set: { categoryId: others._id } }
      );
    }

    return res.status(200).json({
      message: 'Category marked inactive and references moved to OTHERS',
      category: {
        _id: category._id,
        name: category.name,
        type: category.type,
        isActive: category.isActive
      },
      othersCategoryId: others._id,
      matched: updateResult.matchedCount ?? updateResult.n,
      modified: updateResult.modifiedCount ?? updateResult.nModified
    });
  } catch (err) {
    console.error('Error deleting the Category', err);
    return res.status(500).json({ message: 'Error deleting the Category', details: err.message });
  }
});

// UPDATE Category
router.patch('/:id', auth, requireRole('ADMIN'), async (req, res) => {
    try
    {
        const { id } = req.params;
        const updates = req.body;

        // Define which fields are allowed to be updated
        const allowedUpdates = [ 'name', 'type', 'isActive'];
        const updateKeys = Object.keys(updates);

        // Check if all requested updates are allowed
        const isValidOperation = updateKeys.every(key => allowedUpdates.includes(key));
        if (!isValidOperation)
        {
            return res.status(400).json({
                message: "Invalid updates. Field(s) update forbidden"
            });
        }

        // Find the Category and apply updates
        const category = await Category.findByIdAndUpdate(
            id,
            { $set: updates},
            { new: true, runValidators: true}
        );

        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.status(200).json({
            message: "Category updated successfully",
            category
        });
        
    } catch (err) {
        console.error("Error updating product:", err);
        res.status(500).json({ message: err.message});
    }
});

module.exports = router;
