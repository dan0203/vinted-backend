const Joi = require('joi');
const mongoose = require('mongoose');

// Reusable Joi validator for a Mongo ObjectId: Joi has no native type for
// this, so it delegates to mongoose.Types.ObjectId.isValid.
function joiObjectId() {
    return Joi.string().custom((value, helpers) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
            return helpers.error('any.invalid');
        }
        return value;
    }, 'ObjectId validation');
}

module.exports = joiObjectId;
