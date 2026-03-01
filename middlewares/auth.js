const shops = require('../models/shops');
const {verifyAccessToken} = require('../utils/jwt');

module.exports = function (req, res, next) {
    const header = req.headers['authorization'];
    console.log(req.headers['cookie']);

    let token = null;

    if (header && header.startsWith('Bearer ')) {
        token = header.split(' ')[1];
    }

    //Or try to get token from cookies
    if (!token && req.headers['cookie']) {
        

        token = req.headers['cookie'].split(';').find(c => c.trim().startsWith('authorization='));
        console.log('Raw token from cookie:', token);
        //remove authorization= from the token if it exist
        if (token && token.startsWith('authorization=')) {
            token = token.split('=')[1];
        }
       
    }

    if (!token) {
        //give guest token with role GUEST

        return res.status(401).json({ error: 'Access token missing' });
    }

    try {
        const payload = verifyAccessToken(token);
        req.user = {
            id: payload.sub,
            role: payload.role,
            fullName: payload.fullName,
            shops: payload.shops || []
        };
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired access token' + (error.message ? ` - ${error.message}` : '') });
    }

}