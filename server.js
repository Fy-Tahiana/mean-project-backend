const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const routes = require('./routes');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI).
    then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));

// Routes

app.use('/', routes);

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));