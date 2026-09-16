const capitalize = require('./capitalize');
const throwError = require('./throwError');

async function findByIdOrThrow(Model, id, resourceLabel, populate) {
    let query = Model.findById(id);
    if (populate) {
        query = query.populate(populate);
    }

    const doc = await query;

    if (!doc) {
        throwError(`${capitalize(resourceLabel)} does not exist`, 404);
    }

    return doc;
}

async function findAll(
    Model,
    filters = {},
    sortBy = {},
    limit = 0,
    skip = 0,
    populate
) {
    let queryFind = Model.find(filters).sort(sortBy).limit(limit).skip(skip);
    if (populate) {
        queryFind = queryFind.populate(populate);
    }

    const queryCountDocuments = Model.countDocuments(filters);

    const query = Promise.all([queryFind, queryCountDocuments]);
    const [results, count] = await query;

    return [results, count];
}

async function findByIdAndDeleteOrThrow(Model, id, resourceLabel, populate) {
    let query = Model.findByIdAndDelete(id);
    if (populate) {
        query = query.populate(populate);
    }

    const doc = await query;

    if (!doc) {
        throwError(`${capitalize(resourceLabel)} does not exist`, 404);
    }

    return doc;
}

async function findByIdAndUpdateOrThrow(
    Model,
    id,
    resourceLabel,
    updateFields,
    options,
    populate
) {
    let query = Model.findByIdAndUpdate(id, updateFields, options);
    if (populate) {
        query = query.populate(populate);
    }

    const doc = await query;

    if (!doc) {
        throwError(`${capitalize(resourceLabel)} does not exist`, 404);
    }

    return doc;
}

async function save(newObject, populate) {
    let query = await newObject.save();
    if (populate) {
        query = query.populate(populate);
    }

    const doc = await query;

    return doc;
}

async function findOneOrThrow(Model, filter, resourceLabel, populate) {
    let query = Model.findOne(filter);
    if (populate) {
        query = query.populate(populate);
    }

    const doc = await query;

    if (!doc) {
        throwError(`${capitalize(resourceLabel)} does not exist`, 404);
    }

    return doc;
}

async function findOneAndUpdateOrThrow(
    Model,
    filter,
    resourceLabel,
    updateFields,
    options,
    populate
) {
    let query = Model.findOneAndUpdate(filter, updateFields, options);
    if (populate) {
        query = query.populate(populate);
    }

    const doc = await query;

    if (!doc) {
        throwError(`${capitalize(resourceLabel)} does not exist`, 404);
    }

    return doc;
}

async function findOneAndDeleteOrThrow(Model, filter, resourceLabel, populate) {
    let query = Model.findOneAndDelete(filter);
    if (populate) {
        query = query.populate(populate);
    }

    const doc = await query;

    if (!doc) {
        throwError(`${capitalize(resourceLabel)} does not exist`, 404);
    }

    return doc;
}

module.exports = {
    findByIdOrThrow,
    findAll,
    findByIdAndDeleteOrThrow,
    findByIdAndUpdateOrThrow,
    save,
    findOneOrThrow,
    findOneAndUpdateOrThrow,
    findOneAndDeleteOrThrow,
};
