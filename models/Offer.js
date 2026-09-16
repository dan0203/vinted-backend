const mongoose = require('mongoose');
const { Schema } = mongoose;
const imageSchema = require('./imageSchema');

const offerSchema = new Schema({
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
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

offerSchema.index({ price: 1 });

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;
