const mongoose = require('mongoose');
const { Schema } = mongoose;
const imageSchema = require('./imageSchema');

const userSchema = new Schema({
    email: { type: String, required: true, unique: true },
    account: {
        username: { type: String, required: true, trim: true },
        avatar: imageSchema,
    },
    newsletter: Boolean,
    salt: { type: String, required: true },
    hash: { type: String, required: true },
    token: { type: String, required: true },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
