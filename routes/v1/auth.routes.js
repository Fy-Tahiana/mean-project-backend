const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../../models/Users');

router.post('/login', (req, res) => {
    res.json({ message: 'Login route' });
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