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

const detailSchema = new Schema(
    {
        type: Map,
        of: String,
    },
    { _id: false },
);

const offerSchema = new Schema(
    {
        _id: String,
        product_name: String,
        product_description: String,
        product_price: Number,
        product_details: {
            type: [detailSchema],
            default: [],
        },
        product_pictures: {
            type: [imageSchema],
            default: [],
        },
        owner: {
            account: {
                username: String,
                avatar: imageSchema,
            },
            _id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
            },
        },
        product_image: {
            type: imageSchema,
            default: null,
        },
        product_date: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    },
);

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;
