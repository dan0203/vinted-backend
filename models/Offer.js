const mongoose = require('mongoose');
const { Schema } = mongoose;
const imageSchema = require('./imageSchema');

const offerSchema = new Schema({
    // Declared explicitly (instead of being left to Mongoose) so offer.service.js
    // can generate the id upfront and use it as the Cloudinary storage path
    // before the document is saved.
    _id: Schema.Types.ObjectId,
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    details: {
        brand: String,
        size: String,
        color: String,
        condition: String,
        city: String,
    },
    pictures: {
        type: [imageSchema],
        default: [],
    },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    image: {
        type: imageSchema,
        default: {},
    },
    status: {
        type: String,
        enum: ['available', 'reserved', 'sold'],
        default: 'available',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Speeds up GET /offers, which always sorts by price (see FIELD_SORT_OPTIONS)
offerSchema.index({ price: 1 });

// Speeds up GET /offers, which always filters out sold offers
offerSchema.index({ status: 1 });

// Speeds up GET /offers?owner=<id>, which lists one seller's offers
offerSchema.index({ owner: 1 });

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;
