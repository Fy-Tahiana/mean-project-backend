const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const auth = require('../../middlewares/auth');

const User = require('../../models/users');
const {signAccessToken, verifyAccessToken} = require('../../utils/jwt');

function getAuthCookieOptions() {
    const options = {
        httpOnly: true,
        secure: true,
        sameSite: 'None',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000
    };

    if (process.env.COOKIE_DOMAIN) {
        options.domain = process.env.COOKIE_DOMAIN;
    }

    return options;
}

router.post('/login', (req, res) => {
    try {
        const credentials = req.body;
        User.findOne({ email: credentials.email }).then(async (user) => {
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            if(!credentials.password) {
                return res.status(400).json({ error: 'Password is required' });
            }
            const isMatch = await bcrypt.compare(credentials.password, user.password);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            //issue token
            //fetch shops of the user if role is SHOP
            let shops = [];
            if (user.role.toUpperCase() === 'SHOP') {
                shops = await require('../../models/shops').find({ ownerUserId: user._id }).lean();
                //change the field categoryId to an object with id and name in each shop
                for (let shop of shops) {
                    if (shop.categoryId) {
                        const category = await require('../../models/categories').findById(shop.categoryId);
                        shop.category = { id: category._id, name: category.name };
                        delete shop.categoryId;
                    }
                }
            }
            const accessToken = signAccessToken(user, shops);
    
        
            res.cookie('authorization', accessToken, getAuthCookieOptions());
            res.status(200).json({ message: 'Login successful', 
                                   user: { id: user._id, fullName: user.fullName, email: user.email, shops: shops }
             });
        });

    } catch (error) {
        res.status(500).json({ error: 'Login failed', details: error.message });
        
    }
});

router.post('/register', async (req, res) => {
    try {
        const newUser = new User(req.body);
        const exists = await User.findOne({ email: newUser.email });
        if(newUser.role == 'ADMIN'){
            return res.status(403).json({ error: 'Cannot register as ADMIN' });
        }
        if (exists) {
            return res.status(409).json({ error: 'Email already in use' });
        }

        //minimum password length check 6-8 characters
        console.log('Validating password length:', req.body);
        if (newUser.password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        newUser.password = await bcrypt.hash(newUser.password, 10);
        await newUser.save();
    
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        if(error.code === 11000){
            return res.status(409).json({ error: 'Email already in use' });
        }
        res.status(400).json({ error: 'Registration failed', details: error.message, trace: error.stack });
    }
   
  
});

router.post('/logout', (req, res) => {
    try {
        const { maxAge, ...clearCookieOptions } = getAuthCookieOptions();
        res.clearCookie('authorization', clearCookieOptions);
        res.status(200).json({ message: 'Logout successful' });
    } catch (error) {
        res.status(500).json({ error: 'Logout failed', details: error.message });
    }
});

router.get('/me', auth, async (req, res) => {
    try {
        console.log('Authenticated user:', req.user);
        return res.status(200).json({ user: { id: req.user.id, role: req.user.role, fullName: req.user.fullName, shops: req.user.shops } });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user details', details: error.message });
    }
});
module.exports = router;
