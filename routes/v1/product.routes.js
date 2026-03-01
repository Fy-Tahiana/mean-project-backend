const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requirerole');
const express = require('express');
const router = express.Router();
const Shop = require('../../models/shops');
const Category = require('../../models/categories');
const requireOwner = require('../../middlewares/requireOwner');
const requireOwnerShop = require('../../middlewares/requireOwnerShop');
const upload = require('../../middlewares/upload');

module.exports = router;
const mongoose = require('mongoose');
const Product = require('../../models/products');
const Order = require('../../models/orders');

const normalizeStoredImagePath = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const pathname = new URL(raw).pathname || '';
      return pathname.replace(/^\/+/, '');
    } catch {
      return raw.replace(/^https?:\/\/[^/]+\//i, '').replace(/^\/+/, '');
    }
  }

  return raw.replace(/^\/+/, '');
};

const parseImagesArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(normalizeStoredImagePath).filter(Boolean);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(normalizeStoredImagePath).filter(Boolean) : [];
  } catch {
    return [value].map(normalizeStoredImagePath).filter(Boolean);
  }
};

const toProductImageUrl = (file) => `products/${file.filename}`;

const coerceProductBody = (body) => {
  const next = { ...body };
  if (typeof next.price !== 'undefined') next.price = Number(next.price);
  if (typeof next.stock !== 'undefined') next.stock = Number(next.stock);
  if (typeof next.status === 'string') next.status = String(next.status).toUpperCase();
  return next;
};

// CREATE Product ✅

router.post('/', auth, requireRole('SHOP'), upload.array('images', 8), requireOwner(), async (req, res) => {
  try {
    const body = coerceProductBody(req.body);
    const uploadedImages = (req.files || []).map(toProductImageUrl);
    const fallbackImages = parseImagesArray(body.images);
    const images = uploadedImages.length ? uploadedImages : fallbackImages;
    const { shopId, name, price, stock, status, categoryId, description  } = body;

    console.log("Creating product with data:", body);
    console.log("User:", req.user);

    //Find the shop owned by the user
    const shop = await Shop.findById(shopId);

    // Verify shop is active
    if (shop.status.toUpperCase() !== 'ACTIVE') {
      return res.status(403).json({
        message: "Cannot create product for an inactive shop"
      });
    }

    // Verify category exists and is active and of type PRODUCT
    console.log(categoryId);

    if (categoryId) {
      const category = await Category.findById(categoryId);

      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      if (!category.isActive) {
        return res.status(400).json({ message: "Category is inactive" });
      }

      if (category.type !== "PRODUCT") {
        return res.status(400).json({
          message: "This category cannot be used for products"
        });
      }
    }

    // Create the product
    const product = new Product({ shopId, categoryId, name, price, stock, images, status, description });
    await product.save();

    // Return the created product
    res.status(201).json({
      message: "Product created successfully",
      product
    });

  } catch (err) {
    console.error("Error creating product:", err);
    res.status(500).json({ message: err.message });
  }

});


// UPDATE Product for a shop ✅

router.put('/:id', auth, requireRole('SHOP'), upload.array('images', 8), requireOwner(), async (req, res) => {
  try {
    const body = coerceProductBody(req.body);
    const uploadedImages = (req.files || []).map(toProductImageUrl);

    // Find the product
    const product = await Product.findById(req.params.id);
    if (!product) {
      throw new Error("Product not found");
    }

    const retainedImages = parseImagesArray(body.retainedImagesJson || body.retainedImages);
    const hasImageUpdate =
      uploadedImages.length > 0 ||
      typeof body.retainedImagesJson !== 'undefined' ||
      typeof body.retainedImages !== 'undefined';

    const updateBody = { ...body };
    delete updateBody.retainedImagesJson;
    delete updateBody.retainedImages;

    // Replace-set strategy for images on update.
    if (hasImageUpdate) {
      updateBody.images = [...retainedImages, ...uploadedImages];
    }

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: req.params.id },
      updateBody,
      { new: true }
    );

    if (!updatedProduct) return res.status(404).json({ message: "Product not found for this shop" });

    res.json({
      message: "Product updated successfully",
      product: updatedProduct
    });
  } catch (err) {
    console.error("Error updating product:", err);
    res.status(400).json({ message: err.message });
  }
});


// DELETE Product for a shop ✅

router.delete('/:id', auth, requireRole('SHOP'), requireOwner(), async (req, res) => {
  try {

    const deletedProduct = await Product.findOneAndDelete({ _id: req.params.id});
    if (!deletedProduct) return res.status(404).json({ message: "Product not found for this shop" });

    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(500).json({ message: err.message });
  }
});


//get all product by query products?status=active&categoryId=&shopId=&q=&min=&max=&sort=&page=
router.get('/', async (req, res) => {
    try {
        const filter = {};
        let sortObj = {};
        filter.status = 'ACTIVE';
        filter.shopId = { $in: await Shop.find({ status: 'ACTIVE' }).distinct('_id') }; // only products from active shops
        if (req.query.status) {
            filter.status = req.query.status.toUpperCase();
        }
        if (req.query.categoryId) {
            filter.categoryId = req.query.categoryId;
        }
        if (req.query.shopId) {
            if (!mongoose.Types.ObjectId.isValid(req.query.shopId)) {
                return res.status(400).json({ error: 'Invalid shopId' });
            }
            filter.shopId = new mongoose.Types.ObjectId(req.query.shopId);
        }
        //regex to match all words in any order
        if (req.query.q) {
            const q = req.query.q.trim();
            const words = q.split(/\s+/);
            const regex = words.map(word => `(?=.*${word})`).join('') + '.*';
            filter.name = { $regex: regex, $options: 'i' };
        }
       
        //price range filter
        if (req.query.min || req.query.max) {
            filter.price = {};
            if (req.query.min) {
                filter.price.$gte = parseFloat(req.query.min);
            }
            if (req.query.max) {
                filter.price.$lte = parseFloat(req.query.max);
            }
        }
        if (req.query.sort) {
            const s = req.query.sort.toLowerCase();
            if (s === 'price_asc') 
                sortObj.price = 1;
            if (s === 'price_desc') 
                sortObj.price = -1;
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        //fetch products based on filter

        const products = await Product.find(filter).sort(sortObj).skip(skip).limit(limit).populate('shopId', 'name status').populate('categoryId', 'name');
        //return total pages
        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);
        res.status(200).json({ products, totalPages });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch products', details: error.message });
    }
});

router.get('/top', async (req, res) => {
  try {

    //find top 5 products based on total sales (quantity sold) in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    let topProducts = await Order.aggregate([
      { $match: {
         createdAt: { $gte: thirtyDaysAgo },
         status: {$in:['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED']}
        } 
      },
      { $unwind: "$items" },
      { $group: { _id: "$items.productId", 
        totalSold: { $sum: "$items.qty" },
        totalRevenue: { $sum: { $multiply: ["$items.qty", "$items.priceSnapshot"] } }
        } 
      },
      { $sort: { totalSold: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      {
        $lookup: {
          from: "shops",
          localField: "product.shopId",
          foreignField: "_id",
          as: "shop"
        }
      },
      { $unwind: "$shop" },
      { $project: {
          _id: 0,
          productId: "$_id",
          name: "$product.name",
          stock: "$product.stock",
          status: "$product.status",
          shop: "$shop",
          price: "$product.price",
          images: "$product.images",
          totalSold: 1,
          totalRevenue: 1
        } 
      }
    ]);

    //filter out products that are not active
     topProducts = topProducts.filter(p => p.status === 'ACTIVE' && p.shop.status === 'ACTIVE');    
    res.status(200).json(topProducts);
  }catch (error) {
    res.status(500).json({ error: 'Failed to fetch top products', details: error.message });
  }
}
);

router.get('/:id', auth, requireRole('SHOP', 'BUYER', 'ADMIN'), requireOwner(), async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid product ID' });
        }
        const product = await Product.findById(req.params.id).populate('shopId', 'name').populate('categoryId', 'name');
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.status(200).json(product);
    }catch (error) {
        res.status(500).json({ error: 'Failed to fetch product', details: error.message });
    }
});

// Get products with lower stock for a shop ✅
router.get('/low-stock/shop/:shopId', auth, requireRole('SHOP'), requireOwnerShop(), async (req, res) => {
  try {
    const shopId = req.params.shopId;
    
    const lowStockProducts = await Product.find({
        shopId: new mongoose.Types.ObjectId(shopId),
        stock: { $lte: 5 },
        status: 'ACTIVE'
    }).sort({ stock: 1 });

    // If no low stock products, return the lowest stock product instead
    if (lowStockProducts.length === 0) {
      const lowestStockProduct = await Product.findOne({ shopId, status: 'ACTIVE' }).sort({ stock: 1 });

      if (!lowestStockProduct) {
        return res.status(404).json({ message: "No products found for this shop" });
      }

      lowStockProducts.push(lowestStockProduct);
    }

    res.json({
        count: lowStockProducts.length,
        products: lowStockProducts
        });
    } catch (err) {    console.error("Error fetching low stock products:", err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
