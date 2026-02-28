const products = require('../models/products');
const shops = require('../models/shops');
const {verifyAccessToken} = require('../utils/jwt');

module.exports = async function (req, res, next) {
    const cart = req.body.items;
    // console.log("Verifying stock for cart:", cart);

    //check if cart is empty
    if (!cart || cart.length === 0) {
      return res.status(400).json({ message: "No items provided" });
    }

    for (const item of cart) {
        const product = await products.findById(item.productId);

        //check if all products exist
        if (!product) {
            return res.status(404).json({ message: `Product with ID ${item.productId} not found` });
        }
        //verify if product belongs to the shop
        if (String(product.shopId) !== String(item.shopId)) {
            return res.status(400).json({ message: `Product ${product.name} does not belong to shop with ID ${item.shopId}` });
        }
        const shop = await shops.findById(product.shopId);

        //check if shop is active
        if (shop.status.toUpperCase() !== 'ACTIVE') {
            return res.status(400).json({ message: `Shop ${shop.name} is not active` });
        }
        //check if product is active
        if (product.status !== 'ACTIVE') {
            return res.status(400).json({ message: `Product ${product.name} is not available for purchase` });
        }
        //check if stock is sufficient
        if (product.stock < item.qty) {
            return res.status(400).json({ message: `Insufficient stock for product ${product.name}. Available: ${product.stock}, Requested: ${item.qty}` });
        }

    }
    next();

}