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
    hash: { type: String, required: true },
    token: { type: String, required: true },
    tokenIssuedAt: { type: Date, required: true, default: Date.now },
    failedLoginAttempts: { type: Number, required: true, default: 0 },
    lockUntil: { type: Date, default: null },
    active: { type: Boolean, required: true, default: false },
    confirmationToken: { type: String, default: null },
    confirmationTokenExpiresAt: { type: Date, default: null },
    resetToken: { type: String, default: null },
    resetTokenExpiresAt: { type: Date, default: null },
    favorites: {
        type: [{ type: Schema.Types.ObjectId, ref: 'Offer' }],
        default: [],
    },
});

const User = mongoose.model('User', userSchema);

module.exports = User;
