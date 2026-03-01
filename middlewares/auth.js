const {verifyAccessToken} = require('../utils/jwt');

module.exports = function (req, res, next) {
    const header = req.headers['authorization'];

    let token = null;

    if (header && header.startsWith('Bearer ')) {
        token = header.split(' ')[1];
    }

    //Or try to get token from cookies
    if (!token && req.cookies) {
        token = req.cookies['authorization'];
    }

    if (!token) {
        return res.status(401).json({ error: 'Access token missing' });
    }

    try {
        const payload = verifyAccessToken(token);
        req.user = {
            id: payload.sub,
            role: payload.role
        };
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired access token' });
    }

}