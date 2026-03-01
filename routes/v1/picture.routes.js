const express = require('express');
const router = express.Router();
const auth = require('../../middlewares/auth');
const requireRole = require('../../middlewares/requirerole');

//route to serve picture files
router.get('/:type/:filename', (req, res) => {
    const filename = req.params.filename;
    let rootPath = 'uploads/shops/logos/';
    if(req.params.type === 'products') {
        rootPath = 'uploads/products/';
    }
    const options = {
        root: rootPath,
        dotfiles: 'deny',
        headers: {
            'x-timestamp': Date.now(),
            'x-sent': true
        }
    };
    res.sendFile(filename, options, (err) => {
        if (err) {
            console.error("Error sending file:", err);
            res.status(404).json({ message: "File not found" });
        } else {            console.log("File sent:", filename);
        }    });
});


module.exports = router;