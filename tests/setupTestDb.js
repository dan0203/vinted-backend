const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const User = require('../models/User');

// No .env is loaded in the test environment (index.js is the only entry
// point that calls dotenv.config()), so isAuthenticated/user.service need a
// signing secret from somewhere - a fixed test-only value here, never a
// fallback in the source itself.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

let mongoServer;

// Starts a real, ephemeral, in-memory MongoDB instance dedicated to the tests
const connect = async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri, { dbName: 'vinted-test' });
};

// Clears all collections between two tests, without restarting the server
const clearDatabase = async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany();
    }
};

// Cleanly closes the connection and stops the in-memory server at the end
const closeDatabase = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
};

// Activates a signed-up account directly in the DB, bypassing the email
// confirmation link — every existing signup-then-login/authenticated flow
// needs this now that accounts are created inactive by default.
const activateUser = async (email) => {
    await User.findOneAndUpdate({ email }, { active: true });
};

module.exports = { connect, clearDatabase, closeDatabase, activateUser };
