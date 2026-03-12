require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

// Connexion à mon compte cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI + '/vinted');

const userRoutes = require('./routes/user.route');
app.use('/user', userRoutes); // Ajoute automatiquement /user devant les routes importées depuis ./routes/user.js pour éviter de le saisir dans chaque route

const offerRoutes = require('./routes/offer.route');
app.use('/offers', offerRoutes);

app.all(/.*/, (req, res) => {
    res.status(404).json({ message: 'The route does not exist' });
});

app.listen(3000, () => {
    console.log('Server started');
});
