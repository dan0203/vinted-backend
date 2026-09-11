require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

// Connexion DB + démarrage serveur
mongoose
    .connect(process.env.MONGODB_URI, { dbName: 'vinted' })
    .then(() => {
        console.log('MongoDB connected');

        // On démarre le serveur si la connexion à la bdd est établie
        app.listen(process.env.PORT || 3000, () => {
            console.log('Server started');
        });
    })
    .catch((err) => {
        console.error('MongoDB connection failed:', err.message);
        process.exit(1); // Inutile de démarrer sans BDD
    });
