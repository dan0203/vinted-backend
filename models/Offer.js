const mongoose = require('mongoose');
const { Schema } = mongoose;
const imageSchema = require('./imageSchema');

const offerSchema = new Schema({
    _id: Schema.Types.ObjectId,
    product_name: { type: String, required: true, trim: true },
    product_description: { type: String, required: true, trim: true },
    product_price: { type: Number, required: true, min: 0 },
    product_details: {
        // Chaque entrée est un objet libre du type { MARQUE: 'ZARA' }.
        type: [Schema.Types.Mixed],
        default: [],
    },
    product_pictures: {
        type: [imageSchema],
        default: [],
    },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    product_image: {
        type: imageSchema,
        default: null,
    },
    product_date: {
        type: Date,
        default: Date.now,
    },
});

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;
