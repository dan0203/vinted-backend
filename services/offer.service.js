// Modules npm
const mongoose = require('mongoose');
// Model
const Offer = require('../models/Offer');
// Utils
const throwError = require('../utils/throwError');
const escapeRegex = require('../utils/escapeRegex');
const { uploadImage, removeImage } = require('../utils/cloudinary');
const assertCorrectData = require('../utils/assertCorrectData');
const {
    MIN_PRICE,
    MIN_PRICEMIN,
    MIN_PRICEMAX,
    MIN_PAGE,
    OFFERS_PER_PAGE,
    FIELD_TYPE_STRING,
    FIELD_TYPE_NUMBER,
    FIELD_TYPE_FILE,
    FIELD_TYPE_OBJECTID,
    FIELD_SOURCE_BODY,
    FIELD_SOURCE_FILES,
    FIELD_SOURCE_PARAMS,
    FIELD_SOURCE_QUERY,
    FIELD_SORT_OPTIONS,
    OFFER,
    FIELD_NAME_TITLE,
    FIELD_NAME_DESCRIPTION,
    FIELD_NAME_PRICE,
    FIELD_NAME_CONDITION,
    FIELD_NAME_CITY,
    FIELD_NAME_BRAND,
    FIELD_NAME_SIZE,
    FIELD_NAME_COLOR,
    FIELD_NAME_PICTURE,
    FIELD_NAME_PRICEMIN,
    FIELD_NAME_PRICEMAX,
    FIELD_NAME_PAGE,
    FIELD_NAME_SORT,
} = require('../utils/constants');
const {
    findByIdOrThrow,
    findByIdAndDeleteOrThrow,
    findAll,
    findByIdAndUpdateOrThrow,
    save,
} = require('../utils/mongooseOrThrow');
const findOwnedOfferOrThrow = require('../utils/findOwnedOfferOrThrow');

// Dans ce service, la validation des données se fait manuellement, comparé à user service qui utilise le package Joi

const baseOfferFields = [
    {
        name: FIELD_NAME_TITLE,
        type: FIELD_TYPE_STRING,
        required: true,
        source: FIELD_SOURCE_BODY,
    },
    {
        name: FIELD_NAME_DESCRIPTION,
        type: FIELD_TYPE_STRING,
        required: true,
        source: FIELD_SOURCE_BODY,
    },
    {
        name: FIELD_NAME_PRICE,
        type: FIELD_TYPE_NUMBER,
        min: MIN_PRICE,
        exclusiveMin: true,
        required: true,
        source: FIELD_SOURCE_BODY,
    },
    {
        name: FIELD_NAME_CONDITION,
        type: FIELD_TYPE_STRING,
        required: true,
        source: FIELD_SOURCE_BODY,
    },
    {
        name: FIELD_NAME_CITY,
        type: FIELD_TYPE_STRING,
        required: true,
        source: FIELD_SOURCE_BODY,
    },
    {
        name: FIELD_NAME_BRAND,
        type: FIELD_TYPE_STRING,
        required: true,
        source: FIELD_SOURCE_BODY,
    },
    {
        name: FIELD_NAME_SIZE,
        type: FIELD_TYPE_STRING,
        required: true,
        source: FIELD_SOURCE_BODY,
    },
    {
        name: FIELD_NAME_COLOR,
        type: FIELD_TYPE_STRING,
        required: true,
        source: FIELD_SOURCE_BODY,
    },
    {
        name: FIELD_NAME_PICTURE,
        type: FIELD_TYPE_FILE,
        required: true,
        source: FIELD_SOURCE_FILES,
    },
];

const populate = {
    path: 'owner',
    select: '_id account',
};
const publishOrUpdateOptions = {
    returnDocument: 'after',
    runValidators: true,
};

const publish = async (data) => {
    const fields = [...baseOfferFields];
    assertCorrectData(data, fields);

    const price = data.body.price;

    // On génère un id MongoDB pour le chemin de stockage de l'image dans cloudinary
    const newOfferId = new mongoose.Types.ObjectId();

    const cloudinaryResponse = await uploadImage(data.files, newOfferId);

    const newOffer = new Offer({
        _id: newOfferId,
        product_name: data.body.title,
        product_description: data.body.description,
        product_price: price,
        product_details: [
            {
                MARQUE: data.body.brand,
            },
            {
                TAILLE: data.body.size,
            },
            {
                COULEUR: data.body.color,
            },
            {
                ÉTAT: data.body.condition,
            },
            {
                EMPLACEMENT: data.body.city,
            },
        ],
        product_image: cloudinaryResponse,
        product_pictures: [], // Si besoin d'uploader plusieurs images
        owner: data.user._id,
    });

    let publishedOffer;
    try {
        publishedOffer = await save(newOffer, populate);
    } catch (error) {
        if (cloudinaryResponse?.public_id) {
            await removeImage(cloudinaryResponse.public_id);
        }

        throw error;
    }

    return publishedOffer;
};

const update = async (data) => {
    const fields = [
        ...baseOfferFields,
        {
            name: 'id',
            type: FIELD_TYPE_OBJECTID,
            required: true,
            source: FIELD_SOURCE_PARAMS,
        },
    ];
    assertCorrectData(data, fields, OFFER);

    const offerToUpdate = await findOwnedOfferOrThrow(data.id, data.user._id);

    const price = data.body.price;

    const cloudinaryResponse = await uploadImage(data.files, data.id);

    const updateFields = {
        product_name: data.body.title,
        product_description: data.body.description,
        product_price: price,
        product_details: [
            {
                MARQUE: data.body.brand,
            },
            {
                TAILLE: data.body.size,
            },
            {
                COULEUR: data.body.color,
            },
            {
                ÉTAT: data.body.condition,
            },
            {
                EMPLACEMENT: data.body.city,
            },
        ],
        product_image: cloudinaryResponse,
        product_pictures: [], // Si besoin d'uploader plusieurs images
        owner: data.user._id,
    };

    let updatedOffer;
    try {
        updatedOffer = await findByIdAndUpdateOrThrow(
            Offer,
            data.id,
            OFFER,
            updateFields,
            publishOrUpdateOptions,
            populate
        );
    } catch (error) {
        if (cloudinaryResponse?.public_id) {
            await removeImage(cloudinaryResponse.public_id);
        }

        throw error;
    }

    const updatedOfferToReturn = {
        product_name: updatedOffer.product_name,
        product_description: updatedOffer.product_description,
        product_price: updatedOffer.product_price,
        product_details: updatedOffer.product_details,
        product_image: updatedOffer.product_image,
        owner: updatedOffer.owner,
    };

    // Si tout s'est bien passé, on supprime l'ancienne image
    if (offerToUpdate.product_image.public_id) {
        try {
            await removeImage(offerToUpdate.product_image.public_id);
        } catch (error) {
            console.error(
                'Failed removing old image',
                error.error?.message || error.message || error
            );
        }
    }

    return updatedOfferToReturn;
};

const updatePartial = async (data) => {
    const hasBody = !!data.body;
    const hasFiles = !!data.files;

    if (!hasBody && !hasFiles) {
        throwError('No data was sent', 400);
    }

    const fields = [
        {
            name: 'id',
            type: FIELD_TYPE_OBJECTID,
            required: true,
            source: FIELD_SOURCE_PARAMS,
        },
    ];

    if (hasBody) {
        fields.push(
            {
                name: FIELD_NAME_TITLE,
                type: FIELD_TYPE_STRING,
                required: false,
                source: FIELD_SOURCE_BODY,
            },
            {
                name: FIELD_NAME_DESCRIPTION,
                type: FIELD_TYPE_STRING,
                required: false,
                source: FIELD_SOURCE_BODY,
            },
            {
                name: FIELD_NAME_PRICE,
                type: FIELD_TYPE_NUMBER,
                min: MIN_PRICE,
                exclusiveMin: true,
                required: false,
                source: FIELD_SOURCE_BODY,
            },
            {
                name: FIELD_NAME_CONDITION,
                type: FIELD_TYPE_STRING,
                required: false,
                source: FIELD_SOURCE_BODY,
            },
            {
                name: FIELD_NAME_CITY,
                type: FIELD_TYPE_STRING,
                required: false,
                source: FIELD_SOURCE_BODY,
            },
            {
                name: FIELD_NAME_BRAND,
                type: FIELD_TYPE_STRING,
                required: false,
                source: FIELD_SOURCE_BODY,
            },
            {
                name: FIELD_NAME_SIZE,
                type: FIELD_TYPE_STRING,
                required: false,
                source: FIELD_SOURCE_BODY,
            },
            {
                name: FIELD_NAME_COLOR,
                type: FIELD_TYPE_STRING,
                required: false,
                source: FIELD_SOURCE_BODY,
            }
        );
    }

    if (hasFiles) {
        fields.push({
            name: FIELD_NAME_PICTURE,
            type: FIELD_TYPE_FILE,
            required: false,
            source: FIELD_SOURCE_FILES,
        });
    }

    assertCorrectData(data, fields, OFFER);

    const offerToUpdate = await findOwnedOfferOrThrow(data.id, data.user._id);

    const updateFields = {};

    if (hasBody) {
        if (data.body.title !== undefined)
            updateFields.product_name = data.body.title;
        if (data.body.description !== undefined)
            updateFields.product_description = data.body.description;
        if (data.body.price !== undefined)
            updateFields.product_price = data.body.price;

        const product_details = [...offerToUpdate.product_details];

        const fieldToKey = {
            brand: 'MARQUE',
            size: 'TAILLE',
            color: 'COULEUR',
            condition: 'ÉTAT',
            city: 'EMPLACEMENT',
        };

        const upsertDetail = (details, key, value) => {
            const index = details.findIndex((d) => key in d);
            if (index !== -1) {
                details[index] = { [key]: value };
            } else {
                details.push({ [key]: value });
            }
        };

        let hasChangedProductDetails = false;

        Object.keys(fieldToKey).forEach((key) => {
            if (data.body[key] !== undefined && data.body[key].trim() !== '') {
                upsertDetail(product_details, fieldToKey[key], data.body[key]);
                hasChangedProductDetails = true;
            }
        });

        if (hasChangedProductDetails)
            updateFields.product_details = product_details;
    }

    let cloudinaryResponse;
    if (hasFiles) {
        cloudinaryResponse = await uploadImage(data.files, data.id);

        updateFields.product_image = cloudinaryResponse;
    }

    let updatedOffer;
    try {
        updatedOffer = await findByIdAndUpdateOrThrow(
            Offer,
            data.id,
            OFFER,
            updateFields,
            publishOrUpdateOptions,
            populate
        );
    } catch (error) {
        if (cloudinaryResponse?.public_id) {
            await removeImage(cloudinaryResponse.public_id);
        }

        throw error;
    }

    const updatedOfferToReturn = {
        product_name: updatedOffer.product_name,
        product_description: updatedOffer.product_description,
        product_price: updatedOffer.product_price,
        product_details: updatedOffer.product_details,
        product_image: updatedOffer.product_image,
        owner: updatedOffer.owner,
    };

    // Si tout s'est bien passé, on supprime l'ancienne image
    if (
        cloudinaryResponse !== undefined &&
        offerToUpdate.product_image.public_id
    ) {
        try {
            await removeImage(offerToUpdate.product_image.public_id);
        } catch (error) {
            console.error(
                'Failed removing old image',
                error.error?.message || error.message || error
            );
        }
    }

    return updatedOfferToReturn;
};

const remove = async (data) => {
    const fields = [
        { name: 'id', type: FIELD_TYPE_OBJECTID, source: FIELD_SOURCE_PARAMS },
    ];
    assertCorrectData(data, fields, OFFER);

    await findOwnedOfferOrThrow(data.id, data.user._id);

    const removedOffer = await findByIdAndDeleteOrThrow(
        Offer,
        data.id,
        OFFER,
        populate
    );

    // Si tout s'est bien passé, on supprime les images du dossier et le dossier lui-même dans Cloudinary
    if (removedOffer.product_image.public_id) {
        try {
            await removeImage(
                removedOffer.product_image.public_id,
                removedOffer._id
            );
        } catch (error) {
            console.error(
                'Failed removing image',
                error.error?.message || error.message || error
            );
        }
    }

    return {
        _id: removedOffer._id,
        product_name: removedOffer.product_name,
        product_description: removedOffer.product_description,
        product_price: removedOffer.product_price,
        product_details: removedOffer.product_details,
        product_pictures: removedOffer.product_pictures,
        product_image: removedOffer.product_image,
        product_date: removedOffer.product_date,
        owner: removedOffer.owner,
    };
};

const getAll = async (data) => {
    const fields = [
        {
            name: FIELD_NAME_TITLE,
            type: FIELD_TYPE_STRING,
            required: false,
            source: FIELD_SOURCE_QUERY,
        },
        {
            name: FIELD_NAME_PRICEMIN,
            type: FIELD_TYPE_NUMBER,
            min: MIN_PRICEMIN,
            required: false,
            source: FIELD_SOURCE_QUERY,
        },
        {
            name: FIELD_NAME_PRICEMAX,
            type: FIELD_TYPE_NUMBER,
            min: MIN_PRICEMAX,
            required: false,
            source: FIELD_SOURCE_QUERY,
        },
        {
            name: FIELD_NAME_PAGE,
            type: FIELD_TYPE_NUMBER,
            min: MIN_PAGE,
            required: false,
            source: FIELD_SOURCE_QUERY,
        },
        {
            name: FIELD_NAME_SORT,
            type: FIELD_TYPE_STRING,
            required: false,
            source: FIELD_SOURCE_QUERY,
            options: FIELD_SORT_OPTIONS,
        },
    ];
    assertCorrectData(data, fields, OFFER);

    const filters = {};

    // Filtre title
    if (data.title) {
        filters.product_name = new RegExp(escapeRegex(data.title), 'i');
    }

    // Filtres priceMin et priceMax
    const min = data.priceMin === undefined ? undefined : data.priceMin;
    const max = data.priceMax === undefined ? undefined : data.priceMax;

    if (min !== undefined && max !== undefined && min > max) {
        throwError('priceMin cannot be greater than priceMax', 400);
    }

    if (min !== undefined || max !== undefined) {
        filters.product_price = {};
        if (min !== undefined) filters.product_price.$gte = min;
        if (max !== undefined) filters.product_price.$lte = max;
    }

    // Filtre page
    const page = data.page === undefined ? 1 : data.page;
    const limit = OFFERS_PER_PAGE;
    const skip = limit * (page - 1);

    // Filtre sort
    const sort = data.sort === undefined ? FIELD_SORT_OPTIONS[0] : data.sort;
    const direction = sort.replace('price-', '');
    const sortBy = { product_price: direction };

    // Récupération des offres correspondant aux filtres et à la page demandés
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
    const fields = [
        {
            name: 'id',
            type: FIELD_TYPE_OBJECTID,
            required: true,
            source: FIELD_SOURCE_PARAMS,
        },
    ];
    assertCorrectData(data, fields, OFFER);

    const offer = await findByIdOrThrow(Offer, data.id, OFFER, populate);

    return {
        _id: offer._id,
        product_name: offer.product_name,
        product_description: offer.product_description,
        product_price: offer.product_price,
        product_details: offer.product_details,
        product_pictures: offer.product_pictures,
        product_image: offer.product_image,
        product_date: offer.product_date,
        owner: offer.owner,
    };
};

module.exports = { getAll, publish, update, updatePartial, remove, getOne };
