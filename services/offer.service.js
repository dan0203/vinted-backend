const mongoose = require('mongoose');
const Joi = require('joi');
const Offer = require('../models/Offer');
const throwError = require('../utils/throwError');
const escapeRegex = require('../utils/escapeRegex');
const { uploadImage, uploadImages } = require('../utils/cloudinary');
const {
    safeRemoveImage,
    safeDeleteFolder,
    withImageRollback,
} = require('../utils/cloudinaryCleanup');
const joiObjectId = require('../utils/joiObjectId');
const {
    MIN_PRICE,
    MIN_PRICEMIN,
    MIN_PRICEMAX,
    MIN_PAGE,
    OFFERS_PER_PAGE,
    MAX_PICTURES,
    FIELD_SORT_OPTIONS,
    OFFER,
} = require('../utils/constants');
const {
    findByIdOrThrow,
    findByIdAndUpdateOrThrow,
    findAll,
    findOneOrThrow,
    findOneAndUpdateOrThrow,
    findOneAndDeleteOrThrow,
    save,
} = require('../utils/mongooseOrThrow');

// Joi schemas: the files (`picture`) are intentionally not included, Joi
// doesn't apply well to express-fileupload file objects. Their presence is
// already checked by uploadImage() in utils/cloudinary.js.
const offerBodySchema = Joi.object({
    title: Joi.string().trim().min(1).required(),
    description: Joi.string().trim().min(1).required(),
    price: Joi.number().greater(MIN_PRICE).required(),
    condition: Joi.string().trim().min(1).required(),
    city: Joi.string().trim().min(1).required(),
    brand: Joi.string().trim().min(1).required(),
    size: Joi.string().trim().min(1).required(),
    color: Joi.string().trim().min(1).required(),
});

const offerBodyPartialSchema = Joi.object({
    title: Joi.string().trim().min(1),
    description: Joi.string().trim().min(1),
    price: Joi.number().greater(MIN_PRICE),
    condition: Joi.string().trim().min(1),
    city: Joi.string().trim().min(1),
    brand: Joi.string().trim().min(1),
    size: Joi.string().trim().min(1),
    color: Joi.string().trim().min(1),
});

const getAllQuerySchema = Joi.object({
    title: Joi.string(),
    priceMin: Joi.number().min(MIN_PRICEMIN),
    priceMax: Joi.number().min(MIN_PRICEMAX),
    page: Joi.number().integer().min(MIN_PAGE),
    sort: Joi.string().valid(...FIELD_SORT_OPTIONS),
});

// Validates `value` against `schema` and returns the validated version (with
// Joi's type conversions, e.g. "25" -> 25), or throws a 400.
function assertValid(schema, value) {
    const { error, value: validated } = schema.validate(value);
    if (error) {
        throwError(error.details[0].message, 400);
    }
    return validated;
}

function assertValidOfferId(id) {
    const { error } = joiObjectId().required().validate(id);
    if (error) {
        throwError('Invalid offer id', 400);
    }
}

const populate = {
    path: 'owner',
    select: '_id account',
};
const replaceOptions = {
    // We need the document BEFORE the write to know the old image to
    // delete on Cloudinary, while still keeping the write atomic.
    returnDocument: 'before',
    runValidators: true,
};
const partialUpdateOptions = {
    returnDocument: 'after',
    runValidators: true,
};

const detailFieldNames = ['brand', 'size', 'color', 'condition', 'city'];

// Used for full replacement (PUT), where offerBodySchema already guarantees
// every field is present — unlike mergeDetails() below, no filtering needed.
function buildDetails(body) {
    return Object.fromEntries(
        detailFieldNames.map((fieldName) => [fieldName, body[fieldName]])
    );
}

// Merges the existing details with the present (and non-empty) fields from the body.
// Returns `undefined` if no relevant field was provided.
function mergeDetails(existingDetails, body) {
    const changedFields = Object.fromEntries(
        detailFieldNames
            .filter(
                (fieldName) =>
                    body[fieldName] !== undefined &&
                    body[fieldName].trim() !== ''
            )
            .map((fieldName) => [fieldName, body[fieldName]])
    );

    if (Object.keys(changedFields).length === 0) return undefined;

    return { ...existingDetails, ...changedFields };
}

// Single, complete shape returned by all the service's methods
function toOfferDTO(offer) {
    return {
        _id: offer._id,
        name: offer.name,
        description: offer.description,
        price: offer.price,
        details: offer.details,
        pictures: offer.pictures,
        image: offer.image,
        createdAt: offer.createdAt,
        owner: offer.owner,
    };
}

// Deletes image + pictures + the offer's folder on Cloudinary (best
// effort, non-blocking), reused by remove() and removeAllByOwner().
async function cleanupOfferImages(offer) {
    await safeRemoveImage(offer.image.public_id, 'Failed removing image');
    await Promise.all(
        offer.pictures.map((picture) =>
            safeRemoveImage(picture.public_id, 'Failed removing picture')
        )
    );
    await safeDeleteFolder(
        `vinted/offers/${offer._id}`,
        'Failed deleting offer folder'
    );
}

function assertPictureCountWithinLimit(files) {
    if (!files || !files.pictures) return;

    const count = Array.isArray(files.pictures) ? files.pictures.length : 1;
    if (count > MAX_PICTURES) {
        throwError(`You can upload at most ${MAX_PICTURES} pictures`, 400);
    }
}

const publish = async (data) => {
    data.body = assertValid(offerBodySchema, data.body);
    assertPictureCountWithinLimit(data.files);

    // Generate a MongoDB id for the image's storage path in Cloudinary
    const newOfferId = new mongoose.Types.ObjectId();

    const image = await uploadImage(data.files, newOfferId);
    const pictures = await withImageRollback([image], () =>
        uploadImages(data.files, newOfferId)
    );

    const newOffer = new Offer({
        _id: newOfferId,
        name: data.body.title,
        description: data.body.description,
        price: data.body.price,
        details: buildDetails(data.body),
        image,
        pictures,
        owner: data.user._id,
    });

    const publishedOffer = await withImageRollback([image, ...pictures], () =>
        save(newOffer, populate)
    );

    return toOfferDTO(publishedOffer);
};

// Full replacement of an offer (PUT): all fields are required.
// The ownership check and the write are done in a single atomic request
// (filter { _id, owner }) to avoid any TOCTOU between the two; as a
// tradeoff, an existing offer belonging to another user returns 404 (like a
// nonexistent offer) rather than 403, so as not to reveal its existence.
const update = async (data) => {
    assertValidOfferId(data.params.id);
    data.body = assertValid(offerBodySchema, data.body);
    assertPictureCountWithinLimit(data.files);

    const image = await uploadImage(data.files, data.params.id);
    // Full replacement (PUT): no "pictures" sent => start over with an
    // empty batch of secondary images, like for the other fields.
    const pictures = await withImageRollback([image], () =>
        uploadImages(data.files, data.params.id)
    );

    const updateFields = {
        name: data.body.title,
        description: data.body.description,
        price: data.body.price,
        details: buildDetails(data.body),
        image,
        pictures,
    };

    const offerBeforeUpdate = await withImageRollback(
        [image, ...pictures],
        () =>
            findOneAndUpdateOrThrow(
                Offer,
                { _id: data.params.id, owner: data.user._id },
                OFFER,
                updateFields,
                replaceOptions,
                populate
            )
    );

    // Only reachable once the write has succeeded, so the old images are
    // never deleted if the update itself failed.
    await safeRemoveImage(
        offerBeforeUpdate.image.public_id,
        'Failed removing old image'
    );
    await Promise.all(
        offerBeforeUpdate.pictures.map((picture) =>
            safeRemoveImage(picture.public_id, 'Failed removing old picture')
        )
    );

    return toOfferDTO({ ...offerBeforeUpdate.toObject(), ...updateFields });
};

// Partial update (PATCH): needs to know the existing details to merge the
// changed fields into, hence a preliminary read (scoped by owner) before
// the write. Unlike update(), this operation can't be made atomic in a
// single request.
const updatePartial = async (data) => {
    const hasBody = !!data.body;
    const hasFiles = !!data.files;

    if (!hasBody && !hasFiles) {
        throwError('No data was sent', 400);
    }

    assertValidOfferId(data.params.id);
    if (hasBody) {
        data.body = assertValid(offerBodyPartialSchema, data.body);
    }
    assertPictureCountWithinLimit(data.files);

    const offerToUpdate = await findOneOrThrow(
        Offer,
        { _id: data.params.id, owner: data.user._id },
        OFFER
    );

    const updateFields = {};

    if (hasBody) {
        if (data.body.title !== undefined) updateFields.name = data.body.title;
        if (data.body.description !== undefined)
            updateFields.description = data.body.description;
        if (data.body.price !== undefined) updateFields.price = data.body.price;

        const details = mergeDetails(offerToUpdate.details, data.body);
        if (details !== undefined) {
            updateFields.details = details;
        }
    }

    // Each file is independent: sending "pictures" without "picture" (or
    // vice versa) only touches the relevant field, like the body fields.
    const hasNewImage = hasFiles && !!data.files.picture;
    const hasNewPictures = hasFiles && !!data.files.pictures;
    const uploadedImages = [];

    if (hasNewImage) {
        const image = await uploadImage(data.files, data.params.id);
        updateFields.image = image;
        uploadedImages.push(image);
    }

    if (hasNewPictures) {
        const pictures = await withImageRollback(uploadedImages, () =>
            uploadImages(data.files, data.params.id)
        );
        updateFields.pictures = pictures;
        uploadedImages.push(...pictures);
    }

    const updatedOffer = await withImageRollback(uploadedImages, () =>
        findByIdAndUpdateOrThrow(
            Offer,
            data.params.id,
            OFFER,
            updateFields,
            partialUpdateOptions,
            populate
        )
    );

    // Only reachable once the write has succeeded, so the replaced images
    // are never deleted if the update itself failed.
    if (hasNewImage) {
        await safeRemoveImage(
            offerToUpdate.image.public_id,
            'Failed removing old image'
        );
    }
    if (hasNewPictures) {
        await Promise.all(
            offerToUpdate.pictures.map((picture) =>
                safeRemoveImage(
                    picture.public_id,
                    'Failed removing old picture'
                )
            )
        );
    }

    return toOfferDTO(updatedOffer);
};

// The ownership check and the deletion are done in a single atomic
// request, see the comment on update() above.
const remove = async (data) => {
    assertValidOfferId(data.params.id);

    const removedOffer = await findOneAndDeleteOrThrow(
        Offer,
        { _id: data.params.id, owner: data.user._id },
        OFFER,
        populate
    );

    await cleanupOfferImages(removedOffer);

    return toOfferDTO(removedOffer);
};

const getAll = async (data) => {
    const query = assertValid(getAllQuerySchema, data.query);

    const filters = {};

    // title filter
    if (query.title) {
        filters.name = new RegExp(escapeRegex(query.title), 'i');
    }

    // priceMin and priceMax filters
    const { priceMin: min, priceMax: max } = query;

    if (min !== undefined && max !== undefined && min > max) {
        throwError('priceMin cannot be greater than priceMax', 400);
    }

    if (min !== undefined || max !== undefined) {
        filters.price = {};
        if (min !== undefined) filters.price.$gte = min;
        if (max !== undefined) filters.price.$lte = max;
    }

    // page filter
    const page = query.page === undefined ? 1 : query.page;
    const limit = OFFERS_PER_PAGE;
    const skip = limit * (page - 1);

    // sort filter
    const sort = query.sort === undefined ? FIELD_SORT_OPTIONS[0] : query.sort;
    const direction = sort.replace('price-', '');
    const sortBy = { price: direction };

    const [offers, count] = await findAll(
        Offer,
        filters,
        sortBy,
        limit,
        skip,
        populate
    );

    return { count, offers };
};

const getOne = async (data) => {
    assertValidOfferId(data.params.id);

    const offer = await findByIdOrThrow(Offer, data.params.id, OFFER, populate);

    return toOfferDTO(offer);
};

// Cascade used by user account deletion (issue #1): deletes all of an
// owner's offers, with the same Cloudinary cleanup as remove(). Mongo
// request errors propagate (they must fail the caller); only the
// Cloudinary cleanup stays non-blocking, via cleanupOfferImages().
const removeAllByOwner = async (ownerId) => {
    const offers = await Offer.find({ owner: ownerId });
    if (offers.length === 0) return;

    await Offer.deleteMany({ owner: ownerId });
    await Promise.all(offers.map(cleanupOfferImages));
};

module.exports = {
    getAll,
    publish,
    update,
    updatePartial,
    remove,
    getOne,
    removeAllByOwner,
};
