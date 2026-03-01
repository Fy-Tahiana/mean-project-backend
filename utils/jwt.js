const jwt = require('jsonwebtoken');

function signAccessToken(user) {
    return jwt.sign(
        {sub: user._id.toString(), role: user.role},
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