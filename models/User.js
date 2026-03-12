const mongoose = require('mongoose');

const { Schema } = mongoose;

const imageSchema = new Schema(
    {
        asset_id: String,
        public_id: String,
        version: Number,
        version_id: String,
        signature: String,
        width: Number,
        height: Number,
        format: String,
        resource_type: String,
        created_at: Date,
        tags: [String],
        bytes: Number,
        type: String,
        etag: String,
        placeholder: Boolean,
        url: String,
        secure_url: String,
        folder: String,
        access_mode: String,
        original_filename: String,
        api_key: String,
    },
    { _id: false },
);

const userSchema = new Schema({
    email: String,
    account: {
        username: String,
        avatar: imageSchema,
    },
    newsletter: Boolean,
    salt: String,
    hash: String,
    token: String,
});

const User = mongoose.model('User', userSchema);

module.exports = User;
