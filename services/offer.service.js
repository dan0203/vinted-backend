// Modules npm
const mongoose = require('mongoose');
const Joi = require('joi');
// Model
const Offer = require('../models/Offer');
// Utils
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

// Schémas Joi : les fichiers (`picture`) ne sont volontairement pas dedans,
// Joi ne s'applique pas bien aux objets fichier d'express-fileupload. Leur
// présence est déjà vérifiée par uploadImage() dans utils/cloudinary.js.
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

// Valide `value` contre `schema` et renvoie la version validée (avec les
// conversions de type Joi, ex. "25" -> 25), ou lève une 400.
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

// Supprime image + pictures + le dossier de l'offre sur Cloudinary (best
// effort, non bloquant), réutilisé par remove() et removeAllByOwner().
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

    // On génère un id MongoDB pour le chemin de stockage de l'image dans cloudinary
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

// Remplacement complet d'une offre (PUT) : tous les champs sont requis.
// La vérification de propriété et l'écriture sont faites en une seule requête
// atomique (filtre { _id, owner }) pour éviter tout TOCTOU entre les deux ;
// en contrepartie, une offre existante appartenant à un autre utilisateur
// renvoie 404 (comme une offre inexistante) plutôt que 403, afin de ne pas
// révéler son existence.
const update = async (data) => {
    assertValidOfferId(data.params.id);
    data.body = assertValid(offerBodySchema, data.body);
    assertPictureCountWithinLimit(data.files);

    const image = await uploadImage(data.files, data.params.id);
    // Remplacement complet (PUT) : pas de "pictures" envoyé => on repart d'un
    // lot d'images secondaires vide, comme pour les autres champs.
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

    // Si tout s'est bien passé, on supprime les anciennes images
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

    // Chaque fichier est indépendant : envoyer "pictures" sans "picture" (ou
    // l'inverse) ne touche que le champ concerné, comme les champs body.
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

    // Si tout s'est bien passé, on supprime les anciennes images remplacées
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

// La vérification de propriété et la suppression sont faites en une seule
// requête atomique, voir le commentaire de update() ci-dessus.
const remove = async (data) => {
    assertValidOfferId(data.params.id);

    const removedOffer = await findOneAndDeleteOrThrow(
        Offer,
        { _id: data.params.id, owner: data.user._id },
        OFFER,
        populate
    );

    // Si tout s'est bien passé, on supprime les images puis le dossier de
    // l'offre dans Cloudinary
    await cleanupOfferImages(removedOffer);

    return toOfferDTO(removedOffer);
};

const getAll = async (data) => {
    const query = assertValid(getAllQuerySchema, data.query);

    const filters = {};

    // Filtre title
    if (query.title) {
        filters.name = new RegExp(escapeRegex(query.title), 'i');
    }

    // Filtres priceMin et priceMax
    const { priceMin: min, priceMax: max } = query;

    if (min !== undefined && max !== undefined && min > max) {
        throwError('priceMin cannot be greater than priceMax', 400);
    }

    if (min !== undefined || max !== undefined) {
        filters.price = {};
        if (min !== undefined) filters.price.$gte = min;
        if (max !== undefined) filters.price.$lte = max;
    }

    // Filtre page
    const page = query.page === undefined ? 1 : query.page;
    const limit = OFFERS_PER_PAGE;
    const skip = limit * (page - 1);

    // Filtre sort
    const sort = query.sort === undefined ? FIELD_SORT_OPTIONS[0] : query.sort;
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
    assertValidOfferId(data.params.id);

    const offer = await findByIdOrThrow(Offer, data.params.id, OFFER, populate);

    return toOfferDTO(offer);
};

module.exports = { getAll, publish, update, updatePartial, remove, getOne };
