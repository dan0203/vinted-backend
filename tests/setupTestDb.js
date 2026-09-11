const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

// Démarre une vraie instance MongoDB éphémère, en mémoire, dédiée aux tests
const connect = async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri, { dbName: 'vinted-test' });
};

// Vide toutes les collections entre deux tests, sans redémarrer le serveur
const clearDatabase = async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany();
    }
};

// Ferme proprement la connexion et arrête le serveur en mémoire à la fin
const closeDatabase = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
};

module.exports = { connect, clearDatabase, closeDatabase };
