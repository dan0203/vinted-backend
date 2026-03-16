// Modules npm
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
// Modules internes
const userRoutes = require('./routes/user.route');
const offerRoutes = require('./routes/offer.route');

// Connexion à mon compte cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Création de l'app + middlewares globaux
const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/user', userRoutes); // Ajoute automatiquement /user devant les routes importées depuis ./routes/user.js pour éviter de le saisir dans chaque route
app.use('/offers', offerRoutes);
app.all(/.*/, (req, res) => {
    res.status(404).json({ message: 'The route does not exist' });
});

// Middleware de gestion globale d'erreur
app.use((err, req, res, next) => {
    console.error(err.message);
    res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

// Connexion DB + démarrage serveur
mongoose
    .connect(process.env.MONGODB_URI + '/vinted')
    .then(() => {
        console.log('MongoDB connected');

        // On démarre le serveur si la connexion à la bdd est établie
        app.listen(process.env.PORT || 3000, () => {
            console.log('Server started');
        });
    })
    .catch(err => {
        console.error('MongoDB connection failed:', err.message);
        process.exit(1); // Inutile de démarrer sans BDD
    });
