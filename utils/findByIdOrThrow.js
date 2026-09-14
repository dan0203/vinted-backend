const throwError = require('./throwError');

async function findByIdOrThrow(Model, id, resourceLabel) {
    const doc = await Model.findById(id);

    if (!doc) {
        throwError(`${resourceLabel} does not exist`, 404);
    }

    return doc;
}

module.exports = findByIdOrThrow;
