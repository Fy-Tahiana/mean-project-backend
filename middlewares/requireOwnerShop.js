const Shop = require('../models/shops');
module.exports = () => {
  return async (req, res, next) => {
    // auth middleware must run before this
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let shopId = null;

    if (req.query.shopId) {
        shopId = req.query.shopId;
    }
    else if (req.params.shopId) {
        shopId = req.params.shopId;
    }
    else if(req.body.shopId) {
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
    
  }
};
