const jwt = require('jsonwebtoken');

function signAccessToken(user, shops) {
    return jwt.sign(
        {sub: user.id.toString(), role: user.role, shops: shops || []},
        process.env.JWT_ACCESS_SECRET,
        {expiresIn: process.env.JWT_ACCESS_EXPIRES}
    );
}
 

function verifyAccessToken(token) {
    return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

module.exports = {
    signAccessToken,
    verifyAccessToken,
};