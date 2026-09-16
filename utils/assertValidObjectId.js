const mongoose = require('mongoose');
const throwError = require('./throwError');
const capitalize = require('./capitalize');

function assertValidObjectId(id, resourceLabel) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throwError(`Invalid ${capitalize(resourceLabel)} id`, 400);
    }
}

module.exports = assertValidObjectId;
