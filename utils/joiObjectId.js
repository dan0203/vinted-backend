const Joi = require('joi');
const mongoose = require('mongoose');

// Validateur Joi réutilisable pour un ObjectId Mongo : Joi n'a pas de type
// natif pour ça, on délègue à mongoose.Types.ObjectId.isValid.
function joiObjectId() {
    return Joi.string().custom((value, helpers) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
            return helpers.error('any.invalid');
        }
        return value;
    }, 'ObjectId validation');
}

module.exports = joiObjectId;
