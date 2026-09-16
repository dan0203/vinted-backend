const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cloudinary = require('cloudinary').v2;
const userRoutes = require('./routes/user.route');
const offerRoutes = require('./routes/offer.route');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
app.use(helmet());
app.disable('x-powered-by');
app.use(cors());
app.use(express.json());

app.use('/users', userRoutes);
app.use('/offers', offerRoutes);
app.all(/.*/, (req, res) => {
    res.status(404).json({ message: 'The route does not exist' });
});

// The 4-argument signature (err first) is what tells Express this is an
// error handler rather than regular middleware.
app.use((err, req, res, _next) => {
    console.error(err.message);

    if (err.status) {
        return res.status(err.status).json({ message: err.message });
    }

    return res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;
