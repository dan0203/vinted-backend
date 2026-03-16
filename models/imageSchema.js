const mongoose = require('mongoose');
const { Schema } = mongoose;

const imageSchema = new Schema(
    // Les champs sensibles retournés par Cloudinary (api_key) sont volontairement exclus
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
    },
    { _id: false },
);

module.exports = imageSchema;
