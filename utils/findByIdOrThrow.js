const capitalize = require('./capitalize');
const throwError = require('./throwError');

async function findByIdOrThrow(Model, id, resourceLabel) {
    const doc = await Model.findById(id);

    if (!doc) {
        throwError(`${capitalize(resourceLabel)} does not exist`, 404);
    }

    return doc;
}

module.exports = findByIdOrThrow;
