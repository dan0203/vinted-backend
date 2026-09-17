const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const sanitizeMongo = require('./middlewares/sanitizeMongo');
const cloudinary = require('cloudinary').v2;
const userRoutes = require('./routes/user.route');
const offerRoutes = require('./routes/offer.route');
const openapiSpec = require('./config/swagger');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
app.use(helmet());
app.disable('x-powered-by');
// `cors` treats a falsy `origin` as "allow any origin" (wildcard), which would
// silently defeat this restriction if FRONTEND_URL is ever unset - an empty
// array denies every origin instead, matching the documented "restricted to
// FRONTEND_URL" contract even when misconfigured.
app.use(cors({ origin: process.env.FRONTEND_URL || [], credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());
app.use(sanitizeMongo);

app.use('/users', userRoutes);
app.use('/offers', offerRoutes);
app.get('/api-docs.json', (req, res) => res.json(openapiSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
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
