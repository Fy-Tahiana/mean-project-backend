const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

const User = require('../../models/Users');
const {signAccessToken, verifyAccessToken} = require('../../utils/jwt');

router.post('/login', (req, res) => {
    try {
        const credentials = req.body;
        User.findOne({ email: credentials.email }).then(async (user) => {
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            const isMatch = await bcrypt.compare(credentials.passwordHash, user.passwordHash);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            //issue token
            const accessToken = signAccessToken(user);
    
        
            res.cookie('authorization', accessToken, {
                httpOnly: true,
                secure: true,
                sameSite: 'Strict',
                maxAge: 24 * 60 * 60 * 1000 // 1 day
            });
            res.status(200).json({ message: 'Login successful', 
                                   user: { id: user._id, fullName: user.fullName, email: user.email }
             });
        });

    } catch (error) {
        
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
        if (newUser.passwordHash.length < 6 || newUser.passwordHash.length > 8) {
            return res.status(400).json({ error: 'Password must be between 6 and 8 characters' });
        }

        newUser.passwordHash = await bcrypt.hash(newUser.passwordHash, 10);
        await newUser.save();
    
        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        if(error.code === 11000){
            return res.status(409).json({ error: 'Email already in use' });
        }
        res.status(400).json({ error: 'Registration failed', details: error.message });
    }
   
  
});
module.exports = router;