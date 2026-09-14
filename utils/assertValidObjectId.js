const mongoose = require('mongoose');
const throwError = require('./throwError');

function assertValidObjectId(data, resourceLabel) {
    // data.id est une chaîne vide
    if (!data || !data.id || String(data.id).trim() === '') {
        throwError(`${resourceLabel} id is mandatory`, 400);
    }

    // data.id au mauvais format
    if (!mongoose.Types.ObjectId.isValid(data.id)) {
        throwError(`Invalid ${resourceLabel} id`, 400);
    }
}

module.exports = assertValidObjectId;
