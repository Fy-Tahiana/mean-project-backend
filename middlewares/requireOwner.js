const Shop = require('../models/shops');
module.exports = () => {
  return async (req, res, next) => {
    // auth middleware must run before this
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

   if(req.user.role.toUpperCase() === 'SHOP') {
       // check the original URL to determine if it's a product route or shop route
        const isProductRoute = req.originalUrl.includes('/products');

        let shopId = null;

        if(req.method === 'POST') {
          console.log('POST request body:', req.body);

          if (req.body.shopId) {
            shopId = req.body.shopId;
          }

          if(shopId === null){
            return res.status(400).json({ error: 'shopId is required' });
          }

          // Check if the user is the owner of the shop. e;

          if(!req.user.shops.includes(shopId.toString())){
          return res.status(403).json({ error: 'Forbidden: not the owner of the shop' });
          }
          next();
          return;
        }
        
        shopId = req.query.shopId;
        const shop = await Shop.findById(shopId).lean();
        
        if (isProductRoute) {
            if(req.params.id){
              const product = await require('../models/products').findById(req.params.id).lean();
                if(!product){
                  return res.status(404).json({ error: 'Product not found' });
                }
                //check if the shopId of the product matches the shopId in req.user.shops
                  console.log('Product Shop ID:', product.shopId, 'User Shops:', req.user.shops);

                if(!req.user.shops.includes(product.shopId.toString())){
                  return res.status(403).json({ error: 'Forbidden: not the owner of the product' });
                }
                next();
                return;
            }
            
           
            if (!shop) {
                return res.status(404).json({ error: 'You must specify a valid shopId' });
            }
            
            if (shop?.ownerUserId.toString() !== req.user.id) {
                console.log('Owner ID:', shop.ownerUserId, 'User ID:', req.user.id);
                return res.status(403).json({ error: 'Forbidden: not the owner of the shop' });
            }
        }
        
    };
    next();
  }
};
