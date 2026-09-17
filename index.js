require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

if (!process.env.FRONTEND_URL) {
    console.error('FRONTEND_URL is not configured');
    process.exit(1); // Without it, CORS would deny every origin instead of the intended one
}

mongoose
    .connect(process.env.MONGODB_URI, { dbName: 'vinted' })
    .then(() => {
        console.log('MongoDB connected');

        app.listen(process.env.PORT || 3000, () => {
            console.log('Server started');
        });
    })
    .catch((err) => {
        console.error('MongoDB connection failed:', err.message);
        process.exit(1); // No point starting without a DB
    });
