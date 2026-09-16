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
    findByIdAndUpdateOrThrow,
    findAll,
    findOneOrThrow,
    findOneAndUpdateOrThrow,
    findOneAndDeleteOrThrow,
    save,
} = require('../utils/mongooseOrThrow');

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

const partialOfferFields = baseOfferFields
    .filter((field) => field.source === FIELD_SOURCE_BODY)
    .map((field) => ({ ...field, required: false }));

const populate = {
    path: 'owner',
    select: '_id account',
};
const replaceOptions = {
    // On a besoin du document AVANT écriture pour connaître l'ancienne image
    // à supprimer sur Cloudinary, tout en gardant une écriture atomique.
    returnDocument: 'before',
    runValidators: true,
};
const partialUpdateOptions = {
    returnDocument: 'after',
    runValidators: true,
};

const detailFieldNames = ['brand', 'size', 'color', 'condition', 'city'];

// Construit l'objet `details` à partir des champs du body
function buildDetails(body) {
    return Object.fromEntries(
        detailFieldNames.map((fieldName) => [fieldName, body[fieldName]])
    );
}

// Fusionne les détails existants avec les champs présents (et non vides) du body.
// Renvoie `undefined` si aucun champ pertinent n'a été fourni.
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

// Forme unique et complète renvoyée par toutes les méthodes du service
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

// Log non bloquant : on ne fait jamais échouer une opération réussie en DB
// à cause d'un nettoyage Cloudinary qui échoue derrière.
async function safeRemoveImage(publicId, folderId, logLabel) {
    if (!publicId) return;

    try {
        await removeImage(publicId, folderId);
    } catch (error) {
        console.error(logLabel, error.error?.message || error.message || error);
    }
}

// Si `operation` échoue, on supprime l'image qu'on venait d'uploader
// pour ne pas laisser d'image orpheline sur Cloudinary.
async function withImageRollback(cloudinaryResponse, operation) {
    try {
        return await operation();
    } catch (error) {
        if (cloudinaryResponse?.public_id) {
            await removeImage(cloudinaryResponse.public_id);
        }
        throw error;
    }
}

const publish = async (data) => {
    assertCorrectData(data, baseOfferFields, OFFER);

    // On génère un id MongoDB pour le chemin de stockage de l'image dans cloudinary
    const newOfferId = new mongoose.Types.ObjectId();

    const cloudinaryResponse = await uploadImage(data.files, newOfferId);

    const newOffer = new Offer({
        _id: newOfferId,
        name: data.body.title,
        description: data.body.description,
        price: data.body.price,
        details: buildDetails(data.body),
        image: cloudinaryResponse,
        pictures: [], // Si besoin d'uploader plusieurs images
        owner: data.user._id,
    });

    const publishedOffer = await withImageRollback(cloudinaryResponse, () =>
        save(newOffer, populate)
    );

    return toOfferDTO(publishedOffer);
};

// Remplacement complet d'une offre (PUT) : tous les champs sont requis.
// La vérification de propriété et l'écriture sont faites en une seule requête
// atomique (filtre { _id, owner }) pour éviter tout TOCTOU entre les deux ;
// en contrepartie, une offre existante appartenant à un autre utilisateur
// renvoie 404 (comme une offre inexistante) plutôt que 403, afin de ne pas
// révéler son existence.
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

    const cloudinaryResponse = await uploadImage(data.files, data.id);

    const updateFields = {
        name: data.body.title,
        description: data.body.description,
        price: data.body.price,
        details: buildDetails(data.body),
        image: cloudinaryResponse,
        pictures: [], // Si besoin d'uploader plusieurs images
    };

    const offerBeforeUpdate = await withImageRollback(cloudinaryResponse, () =>
        findOneAndUpdateOrThrow(
            Offer,
            { _id: data.id, owner: data.user._id },
            OFFER,
            updateFields,
            replaceOptions,
            populate
        )
    );

    // Si tout s'est bien passé, on supprime l'ancienne image
    await safeRemoveImage(
        offerBeforeUpdate.image.public_id,
        undefined,
        'Failed removing old image'
    );

    return toOfferDTO({ ...offerBeforeUpdate.toObject(), ...updateFields });
};

// Mise à jour partielle (PATCH) : nécessite de connaître les details
// existant pour y fusionner les champs modifiés, d'où une lecture préalable
// (scopée par owner) avant l'écriture. Contrairement à update(), on ne peut
// pas rendre cette opération atomique en une seule requête.
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
        ...(hasBody ? partialOfferFields : []),
        ...(hasFiles
            ? [
                  {
                      name: FIELD_NAME_PICTURE,
                      type: FIELD_TYPE_FILE,
                      required: false,
                      source: FIELD_SOURCE_FILES,
                  },
              ]
            : []),
    ];
    assertCorrectData(data, fields, OFFER);

    const offerToUpdate = await findOneOrThrow(
        Offer,
        { _id: data.id, owner: data.user._id },
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

    let cloudinaryResponse;
    if (hasFiles) {
        cloudinaryResponse = await uploadImage(data.files, data.id);
        updateFields.image = cloudinaryResponse;
    }

    const updatedOffer = await withImageRollback(cloudinaryResponse, () =>
        findByIdAndUpdateOrThrow(
            Offer,
            data.id,
            OFFER,
            updateFields,
            partialUpdateOptions,
            populate
        )
    );

    // Si tout s'est bien passé, on supprime l'ancienne image
    if (cloudinaryResponse !== undefined) {
        await safeRemoveImage(
            offerToUpdate.image.public_id,
            undefined,
            'Failed removing old image'
        );
    }

    return toOfferDTO(updatedOffer);
};

// La vérification de propriété et la suppression sont faites en une seule
// requête atomique, voir le commentaire de update() ci-dessus.
const remove = async (data) => {
    const fields = [
        { name: 'id', type: FIELD_TYPE_OBJECTID, source: FIELD_SOURCE_PARAMS },
    ];
    assertCorrectData(data, fields, OFFER);

    const removedOffer = await findOneAndDeleteOrThrow(
        Offer,
        { _id: data.id, owner: data.user._id },
        OFFER,
        populate
    );

    // Si tout s'est bien passé, on supprime les images du dossier et le dossier lui-même dans Cloudinary
    await safeRemoveImage(
        removedOffer.image.public_id,
        removedOffer._id,
        'Failed removing image'
    );

    return toOfferDTO(removedOffer);
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
        filters.name = new RegExp(escapeRegex(data.title), 'i');
    }

    // Filtres priceMin et priceMax
    const { priceMin: min, priceMax: max } = data;

    if (min !== undefined && max !== undefined && min > max) {
        throwError('priceMin cannot be greater than priceMax', 400);
    }

    if (min !== undefined || max !== undefined) {
        filters.price = {};
        if (min !== undefined) filters.price.$gte = min;
        if (max !== undefined) filters.price.$lte = max;
    }

    // Filtre page
    const page = data.page === undefined ? 1 : data.page;
    const limit = OFFERS_PER_PAGE;
    const skip = limit * (page - 1);

    // Filtre sort
    const sort = data.sort === undefined ? FIELD_SORT_OPTIONS[0] : data.sort;
    const direction = sort.replace('price-', '');
    const sortBy = { price: direction };

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

    return toOfferDTO(offer);
};

module.exports = { getAll, publish, update, updatePartial, remove, getOne };
